import type { PiAccountProvider } from './pi-accounts'
import type { ProviderRateLimits } from './rate-limit-types'

/**
 * Why `noToken`: a bucket account whose access token expired is not refreshed here — the
 * per-account refresh lock protocol owns that — so usage stays unknown until Pi renews it.
 */
export type PiAccountUsageStatus = 'unknown' | 'ok' | 'error' | 'noToken'

export type PiAccountUsage = {
  provider: PiAccountProvider
  name: string
  /** Derived in main from the stored credential; the token itself never crosses the bridge. */
  email: string | null
  status: PiAccountUsageStatus
  rateLimits: ProviderRateLimits | null
  /** Unix ms of the last completed read, null when never read. */
  updatedAt: number | null
  isFetching: boolean
}

export type PiAccountUsageState = { accounts: PiAccountUsage[] }

/** One history sample: [unix seconds, 5h percent or -1, weekly percent or -1]. */
export type PiAccountUsageSample = [number, number, number]

export type PiAccountUsageHistory = {
  provider: PiAccountProvider
  name: string
  samples: PiAccountUsageSample[]
}

export type PiAccountUsageApi = {
  list: () => Promise<PiAccountUsageState>
  /** Marks this renderer as watching; usage is only polled while at least one watcher is open. */
  setWatching: (watching: boolean) => Promise<PiAccountUsageState>
  history: (provider: PiAccountProvider, name: string) => Promise<PiAccountUsageHistory>
  onChange: (callback: (state: PiAccountUsageState) => void) => () => void
}
