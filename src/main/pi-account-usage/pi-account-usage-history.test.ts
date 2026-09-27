import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { PiAccountUsageHistory } from './pi-account-usage-history'

const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

async function historyFile(): Promise<{ history: PiAccountUsageHistory; path: string }> {
  const home = await mkdtemp(join(tmpdir(), 'pi-account-history-'))
  homes.push(home)
  const path = join(home, 'history.json')
  return { history: new PiAccountUsageHistory(() => path), path }
}

function limits(session: number, weekly: number | null): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent: session, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly:
      weekly === null
        ? null
        : { usedPercent: weekly, windowMinutes: 10080, resetsAt: null, resetDescription: null },
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

it('keeps one sample per five minutes and drops samples older than eight days', async () => {
  const { history } = await historyFile()
  const start = Date.parse('2026-01-10T00:00:00Z')

  await history.record('anthropic/work', limits(10, 5), start - 9 * 24 * 60 * 60 * 1000)
  await history.record('anthropic/work', limits(20, 6), start)
  // Inside the sampling gap: ignored.
  await history.record('anthropic/work', limits(30, 7), start + 60_000)
  await history.record('anthropic/work', limits(40, 8), start + 10 * 60_000)

  const samples = await history.read('anthropic/work')
  expect(samples.map((sample) => sample[1])).toEqual([20, 40])
  expect(samples[0]).toEqual([Math.floor(start / 1000), 20, 6])
})

it('forgets accounts that are no longer in the bucket', async () => {
  const { history, path } = await historyFile()
  await history.record('anthropic/work', limits(10, 5))
  await history.record('openai-codex/gone', limits(10, 5))

  await history.retain(new Set(['anthropic/work']))

  expect(await history.read('openai-codex/gone')).toEqual([])
  expect(JSON.parse(await readFile(path, 'utf8')).accounts['openai-codex/gone']).toBeUndefined()
})
