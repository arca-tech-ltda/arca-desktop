import { useCallback, useEffect, useState } from 'react'
import type { MegamindStatus } from '../../../../../shared/arca-megamind'

export type MegamindConnection = {
  status: MegamindStatus
  /** The last enrollment attempt or status read failed; the panel says so instead of guessing. */
  failed: boolean
  busy: boolean
  start: () => void
}

/** Device enrollment: the credential the app's own presence and the MCP tools ride on. */
export function useMegamindConnection(): MegamindConnection {
  const [status, setStatus] = useState<MegamindStatus>({ state: 'disconnected' })
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const api = window.api.arcaMegamind
    if (!api) {
      return
    }
    void api
      .status()
      .then(setStatus)
      .catch(() => setFailed(true))
    return api.onUpdate(setStatus)
  }, [])
  const start = useCallback(() => {
    setBusy(true)
    setFailed(false)
    void window.api.arcaMegamind
      .startEnrollment()
      .then((next) => {
        setStatus(next)
        if (next.verificationUri) {
          void window.api.shell.openUrl(next.verificationUri)
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false))
  }, [])
  return { status, failed, busy, start }
}
