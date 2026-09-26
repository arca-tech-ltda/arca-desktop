import { useCallback, useEffect, useState } from 'react'
import type { CliInstallStatus } from '../../../shared/cli-install-types'
import { isOrcaCliAvailableOnPath } from '@/lib/agent-skill-cli-prerequisite'

export type CliRegistrationState = {
  status: CliInstallStatus | null
  /** True once the shell command is usable, or when this platform/launch mode cannot register one. */
  registered: boolean
  checking: boolean
  checked: boolean
  refresh: () => void
}

export function isCliRegistrationSettled(status: CliInstallStatus | null): boolean {
  // Why: an unsupported platform or browser-managed launch has no command to register,
  // so waiting for one would leave the setup step permanently unfinished.
  return status !== null && (!status.supported || isOrcaCliAvailableOnPath(status))
}

export function useCliRegistrationStatus(
  options: { enabled?: boolean } = {}
): CliRegistrationState {
  const { enabled = true } = options
  const [status, setStatus] = useState<CliInstallStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback((): void => setRefreshToken((token) => token + 1), [])

  useEffect(() => {
    if (!enabled) {
      setStatus(null)
      setChecked(false)
      setChecking(false)
      return
    }
    let stale = false
    const read = (): void => {
      setChecking(true)
      window.api.cli
        .getInstallStatus()
        .then((next) => {
          if (stale) {
            return
          }
          setStatus(next)
          setChecked(true)
          setChecking(false)
        })
        .catch(() => {
          if (stale) {
            return
          }
          setChecked(true)
          setChecking(false)
        })
    }
    read()
    // Why: registration can happen in Settings or through a system prompt outside this view.
    window.addEventListener('focus', read)
    return () => {
      stale = true
      window.removeEventListener('focus', read)
    }
  }, [enabled, refreshToken])

  return {
    status,
    registered: isCliRegistrationSettled(status),
    checking,
    checked,
    refresh
  }
}
