import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { MegamindStatus } from '../../../../shared/arca-megamind'

/** Device enrollment: the credential the app's own presence and the MCP tools ride on. */
export function MegamindConnection(): React.JSX.Element {
  const [status, setStatus] = useState<MegamindStatus>({ state: 'disconnected' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    const api = window.api.arcaMegamind
    if (!api) {
      return
    }
    void api
      .status()
      .then(setStatus)
      .catch(() => setError(true))
    return api.onUpdate(setStatus)
  }, [])
  const start = async (): Promise<void> => {
    setBusy(true)
    setError(false)
    try {
      const next = await window.api.arcaMegamind.startEnrollment()
      setStatus(next)
      if (next.verificationUri) {
        void window.api.shell.openUrl(next.verificationUri)
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2 text-xs">
      {status.state === 'connected' ? (
        <span>
          {translate('arca.megamind.connectedAs', 'Connected as')} {status.device}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={busy || status.state === 'pending'}
          onClick={() => void start()}
        >
          {translate('arca.megamind.connect', 'Connect to Megamind')}
        </Button>
      )}
      {status.state === 'pending' && (
        <p>
          {translate('arca.megamind.confirmCode', 'Confirm this code in Mainframe:')}{' '}
          <strong>{status.userCode}</strong>
        </p>
      )}
      {status.state === 'expired' && (
        <p role="status">
          {translate('arca.megamind.expired', 'Code expired. Connect again to retry.')}
        </p>
      )}
      {(error || status.state === 'error') && (
        <p role="alert">
          {translate(
            'arca.megamind.connectionError',
            'Connection failed. Check your credentials and try again.'
          )}
        </p>
      )}
    </div>
  )
}
