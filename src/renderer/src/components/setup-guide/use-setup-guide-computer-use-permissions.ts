import { useCallback, useEffect, useState } from 'react'
import { getComputerUsePermissionSetupState } from './setup-guide-progress-readiness'

export type SetupGuideComputerUsePermissions = {
  checked: boolean
  ready: boolean
  unavailable: boolean
}

export function useSetupGuideComputerUsePermissions(
  enabled: boolean
): SetupGuideComputerUsePermissions {
  const [checked, setChecked] = useState(false)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const readComputerUsePermissions = useCallback(async (isStale: () => boolean): Promise<void> => {
    const status = await window.api.computerUsePermissions.getStatus().catch(() => null)
    if (isStale()) {
      return
    }
    const permissionState = getComputerUsePermissionSetupState(status)
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Why: async permission checks update setup progress after external OS state changes.
    setChecked(true)
    setReady(permissionState.ready)
    setUnavailable(permissionState.unavailable)
  }, [])

  useEffect(() => {
    if (!enabled) {
      // Why: unavailable setup-guide steps must clear stale permission state before
      // readiness is derived for the visible checklist.
      setChecked(false)
      setReady(false)
      setUnavailable(false)
      return
    }
    let stale = false
    const refreshComputerUsePermissions = (): void => {
      void readComputerUsePermissions(() => stale)
    }
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Why: refresh the setup checklist when the permission step becomes active.
    refreshComputerUsePermissions()
    const handleFocus = (): void => {
      void refreshComputerUsePermissions()
    }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshComputerUsePermissions()
      }
    }
    // Why: users grant Computer Use permissions outside the setup guide. Refresh
    // on return so the checklist updates without requiring a remount.
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stale = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, readComputerUsePermissions])

  return enabled
    ? { checked, ready, unavailable }
    : { checked: false, ready: false, unavailable: false }
}
