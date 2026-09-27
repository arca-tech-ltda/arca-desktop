import type { PiAccountProvider } from '../../shared/pi-accounts'
import type {
  PiAccountUsage,
  PiAccountUsageHistory as PiAccountUsageHistoryPayload,
  PiAccountUsageState,
  PiAccountUsageStatus
} from '../../shared/pi-account-usage'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import {
  hasUsableAccessToken,
  piAccountKey,
  readPiAccountCredentials,
  type PiAccountCredential
} from './pi-account-credentials'
import { fetchPiAccountUsage } from './pi-account-usage-fetch'
import { PiAccountUsageHistory } from './pi-account-usage-history'

/** One read per account per five minutes, as agreed for the accounts screen. */
const USAGE_TTL_MS = 5 * 60 * 1000
/** Spacing between accounts in a sweep so a roster of five is not a burst. */
const ACCOUNT_STAGGER_MS = 1_500

type CacheEntry = {
  status: PiAccountUsageStatus
  rateLimits: ProviderRateLimits | null
  updatedAt: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

export class PiAccountUsageService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly fetching = new Set<string>()
  private readonly listeners = new Set<(state: PiAccountUsageState) => void>()
  private readonly history: PiAccountUsageHistory
  private credentials: PiAccountCredential[] = []
  private watchers = 0
  private sweeping: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: { history?: PiAccountUsageHistory } = {}) {
    this.history = options.history ?? new PiAccountUsageHistory()
  }

  async list(): Promise<PiAccountUsageState> {
    await this.loadCredentials()
    return this.snapshot()
  }

  /**
   * Usage is only polled while the accounts screen or the status bar is showing it; with no
   * watcher the timer stops and nothing touches the provider APIs.
   */
  async setWatching(watching: boolean): Promise<PiAccountUsageState> {
    this.watchers = Math.max(0, this.watchers + (watching ? 1 : -1))
    if (this.watchers === 0) {
      this.stopTimer()
      return this.snapshot()
    }
    const state = await this.list()
    void this.sweep()
    return state
  }

  /** Resolves once the in-flight sweep, including its history write, has finished. */
  async whenSettled(): Promise<void> {
    await this.sweeping
  }

  releaseWatcher(): void {
    void this.setWatching(false)
  }

  async getHistory(
    provider: PiAccountProvider,
    name: string
  ): Promise<PiAccountUsageHistoryPayload> {
    return {
      provider,
      name,
      samples: await this.history.read(piAccountKey(provider, name))
    }
  }

  onChange(listener: (state: PiAccountUsageState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.stopTimer()
    this.listeners.clear()
  }

  private async loadCredentials(): Promise<void> {
    try {
      this.credentials = await readPiAccountCredentials()
    } catch {
      // A half-written bucket is not a roster change; keep the last one.
      return
    }
    const keys = new Set(
      this.credentials.map((credential) => piAccountKey(credential.provider, credential.name))
    )
    for (const key of this.cache.keys()) {
      if (!keys.has(key)) {
        this.cache.delete(key)
      }
    }
    await this.history.retain(keys).catch(() => {})
  }

  private statusFor(credential: PiAccountCredential, key: string): PiAccountUsageStatus {
    const cached = this.cache.get(key)
    if (cached) {
      return cached.status
    }
    return hasUsableAccessToken(credential) ? 'unknown' : 'noToken'
  }

  private snapshot(): PiAccountUsageState {
    const accounts: PiAccountUsage[] = this.credentials.map((credential) => {
      const key = piAccountKey(credential.provider, credential.name)
      const cached = this.cache.get(key) ?? null
      return {
        provider: credential.provider,
        name: credential.name,
        email: credential.email,
        status: this.statusFor(credential, key),
        rateLimits: cached?.rateLimits ?? null,
        updatedAt: cached?.updatedAt ?? null,
        isFetching: this.fetching.has(key)
      }
    })
    return { accounts }
  }

  private publish(): void {
    const state = this.snapshot()
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleSweep(): void {
    this.stopTimer()
    if (this.watchers === 0) {
      return
    }
    this.timer = setTimeout(() => void this.sweep(), USAGE_TTL_MS)
    this.timer.unref?.()
  }

  private isFresh(key: string, now: number): boolean {
    const cached = this.cache.get(key)
    return cached !== undefined && now - cached.updatedAt < USAGE_TTL_MS
  }

  private sweep(): Promise<void> {
    if (this.sweeping) {
      return this.sweeping
    }
    if (this.watchers === 0) {
      return Promise.resolve()
    }
    this.sweeping = this.runSweep()
    return this.sweeping
  }

  private async runSweep(): Promise<void> {
    try {
      await this.loadCredentials()
      let staggered = false
      for (const credential of this.credentials) {
        const key = piAccountKey(credential.provider, credential.name)
        if (this.watchers === 0) {
          break
        }
        if (this.isFresh(key, Date.now())) {
          continue
        }
        if (!hasUsableAccessToken(credential)) {
          // No refresh here by design: the bucket's refresh belongs to Pi's lock protocol.
          this.cache.delete(key)
          continue
        }
        if (staggered) {
          await delay(ACCOUNT_STAGGER_MS)
        }
        staggered = true
        await this.fetchOne(credential, key)
      }
    } finally {
      this.sweeping = null
      this.scheduleSweep()
    }
  }

  private async fetchOne(credential: PiAccountCredential, key: string): Promise<void> {
    this.fetching.add(key)
    this.publish()
    try {
      const limits = await fetchPiAccountUsage(credential)
      this.cache.set(key, {
        status: limits.status === 'ok' ? 'ok' : 'error',
        rateLimits: limits,
        updatedAt: Date.now()
      })
      if (limits.status === 'ok') {
        await this.history.record(key, limits).catch(() => {})
      }
    } catch {
      // Why: one account's network or auth failure must not stop the rest of the sweep.
      this.cache.set(key, {
        status: 'error',
        rateLimits: null,
        updatedAt: Date.now()
      })
    } finally {
      this.fetching.delete(key)
      this.publish()
    }
  }
}
