import { useEffect, useRef, useState } from 'react'
import type { PiAccountProvider } from '../../../../shared/pi-accounts'
import type {
  PiAccountUsage,
  PiAccountUsageSample,
  PiAccountUsageState
} from '../../../../shared/pi-account-usage'

export function piAccountUsageKey(provider: PiAccountProvider, name: string): string {
  return `${provider}/${name}`
}

export type PiAccountUsageController = {
  usage: Record<string, PiAccountUsage>
  history: Record<string, PiAccountUsageSample[]>
}

const EMPTY: PiAccountUsageController = { usage: {}, history: {} }

function indexUsage(state: PiAccountUsageState): Record<string, PiAccountUsage> {
  return Object.fromEntries(
    state.accounts.map((account) => [piAccountUsageKey(account.provider, account.name), account])
  )
}

/**
 * Subscribes to per-account quota while this screen is mounted. Main polls only while a watcher
 * is registered, so unmounting stops every provider call.
 */
export function usePiAccountUsage(enabled: boolean): PiAccountUsageController {
  const [usage, setUsage] = useState<Record<string, PiAccountUsage>>({})
  const [history, setHistory] = useState<Record<string, PiAccountUsageSample[]>>({})
  const loadedHistoryRef = useRef(new Map<string, number>())

  useEffect(() => {
    const api = window.api.piAccountUsage
    if (!enabled || !api) {
      return
    }
    let disposed = false
    const apply = (state: PiAccountUsageState): void => {
      if (!disposed) {
        setUsage(indexUsage(state))
      }
    }
    const stop = api.onChange(apply)
    void api.setWatching(true).then(apply, () => {})
    return () => {
      disposed = true
      stop()
      void api.setWatching(false).catch(() => {})
    }
  }, [enabled])

  useEffect(() => {
    const api = window.api.piAccountUsage
    if (!enabled || !api) {
      return
    }
    let disposed = false
    for (const account of Object.values(usage)) {
      const key = piAccountUsageKey(account.provider, account.name)
      // Why: reread history only after a new sample could exist, not on every render.
      if (loadedHistoryRef.current.get(key) === (account.updatedAt ?? 0)) {
        continue
      }
      loadedHistoryRef.current.set(key, account.updatedAt ?? 0)
      void api.history(account.provider, account.name).then((result) => {
        if (!disposed) {
          setHistory((previous) => ({ ...previous, [key]: result.samples }))
        }
      }, undefined)
    }
    return () => {
      disposed = true
    }
  }, [enabled, usage])

  return enabled ? { usage, history } : EMPTY
}
