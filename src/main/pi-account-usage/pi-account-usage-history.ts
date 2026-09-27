import { app } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import type { PiAccountUsageSample } from '../../shared/pi-account-usage'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { readJson, writeJson } from '../pi-accounts/files'

const RETENTION_MS = 8 * 24 * 60 * 60 * 1000
/** One sample per account per window keeps eight days of history around 10 KB. */
const MIN_SAMPLE_GAP_MS = 5 * 60 * 1000
const MISSING = -1

const sampleSchema = z.tuple([z.number(), z.number(), z.number()])
const historySchema = z.object({
  version: z.literal(1),
  accounts: z.record(z.string(), z.array(sampleSchema))
})
type HistoryFile = z.infer<typeof historySchema>

function emptyHistory(): HistoryFile {
  return { version: 1, accounts: {} }
}

function percentOf(window: { usedPercent: number } | null | undefined): number {
  return window && Number.isFinite(window.usedPercent)
    ? Math.round(Math.max(0, Math.min(100, window.usedPercent)))
    : MISSING
}

/** Keeps the whole history in one small file; per-account files would multiply writes. */
export class PiAccountUsageHistory {
  private cache: HistoryFile | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly resolvePath: () => string = defaultHistoryPath) {}

  async read(key: string): Promise<PiAccountUsageSample[]> {
    return (await this.load()).accounts[key] ?? []
  }

  /** No-ops when the last sample is younger than the sampling gap or the read produced nothing. */
  async record(key: string, limits: ProviderRateLimits, now = Date.now()): Promise<void> {
    const session = percentOf(limits.session)
    const weekly = percentOf(limits.weekly)
    if (session === MISSING && weekly === MISSING) {
      return
    }
    const file = await this.load()
    const samples = file.accounts[key] ?? []
    const last = samples.at(-1)
    if (last && now - last[0] * 1000 < MIN_SAMPLE_GAP_MS) {
      return
    }
    const cutoff = Math.floor((now - RETENTION_MS) / 1000)
    file.accounts[key] = [
      ...samples.filter((sample) => sample[0] >= cutoff),
      [Math.floor(now / 1000), session, weekly]
    ]
    await this.persist(file)
  }

  /** Drops history for accounts that no longer exist, so renames do not leak forever. */
  async retain(keys: Set<string>): Promise<void> {
    const file = await this.load()
    const stale = Object.keys(file.accounts).filter((key) => !keys.has(key))
    if (stale.length === 0) {
      return
    }
    for (const key of stale) {
      delete file.accounts[key]
    }
    await this.persist(file)
  }

  private async load(): Promise<HistoryFile> {
    if (!this.cache) {
      const parsed = historySchema.safeParse(await readJson(this.resolvePath(), emptyHistory()))
      this.cache = parsed.success ? parsed.data : emptyHistory()
    }
    return this.cache
  }

  private async persist(file: HistoryFile): Promise<void> {
    this.cache = file
    const path = this.resolvePath()
    this.writing = this.writing.then(
      () => writeJson(path, file),
      () => writeJson(path, file)
    )
    await this.writing.catch(() => {})
  }
}

function defaultHistoryPath(): string {
  return join(app.getPath('userData'), 'pi-account-usage-history.json')
}
