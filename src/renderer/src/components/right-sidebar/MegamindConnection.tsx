import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { announceMegamind, megamindApprovalTarget } from '@/attention/megamind-events'
import type { MegamindApproval, MegamindStatus } from '../../../../shared/arca-megamind'

export function MegamindConnection({
  navigate
}: {
  navigate: (url: string) => void
}): React.JSX.Element {
  const [status, setStatus] = useState<MegamindStatus>({ state: 'disconnected' })
  const [approvals, setApprovals] = useState<MegamindApproval[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [login, setLogin] = useState(false)
  useEffect(() => {
    const reveal = (): void => {
      const id = megamindApprovalTarget()
      if (id) {
        document.getElementById(`megamind-approval-${id}`)?.scrollIntoView({ block: 'nearest' })
      }
    }
    reveal()
    window.addEventListener('arca-megamind-approval', reveal)
    return () => window.removeEventListener('arca-megamind-approval', reveal)
  }, [approvals])
  useEffect(() => {
    const api = window.api.arcaMegamind
    if (!api) {
      return
    }
    void api
      .status()
      .then(setStatus)
      .catch(() => setError(true))
    const off = api.onUpdate(setStatus)
    const refresh = (): void => {
      void api
        .approvals()
        .then((items) => {
          setApprovals(items)
          items
            .filter((item) => item.relevant)
            .forEach((item) => announceMegamind({ ...item, kind: 'approval_pending' }))
        })
        .catch(() => setError(true))
    }
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [])
  const start = async (): Promise<void> => {
    setBusy(true)
    setError(false)
    try {
      const next = await window.api.arcaMegamind.startEnrollment()
      setStatus(next)
      if (next.verificationUri) {
        navigate(next.verificationUri)
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const decide = async (id: string, decision: 'approved' | 'denied'): Promise<void> => {
    setBusy(true)
    setError(false)
    setLogin(false)
    try {
      const result = await window.api.arcaMegamind.decide(id, decision)
      if (result === 'login') {
        setLogin(true)
      } else {
        setApprovals((items) => items.filter((item) => item.id !== id))
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex max-h-64 shrink-0 flex-col gap-2 overflow-auto scrollbar-sleek border-b border-border p-2 text-xs">
      {status.state === 'connected' ? (
        <span>
          {translate('arca.megamind.connectedAs', 'Connected as')} {status.device}
        </span>
      ) : (
        <Button
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
      {login && (
        <p role="status">
          {translate(
            'arca.megamind.loginRequired',
            'Sign in to Mainframe, then retry your decision.'
          )}
        </p>
      )}
      {approvals.map((item) => (
        <div key={item.id} id={`megamind-approval-${item.id}`} className="flex flex-col gap-1">
          <p>{item.summary}</p>
          <div className="flex gap-2">
            <Button size="xs" disabled={busy} onClick={() => void decide(item.id, 'approved')}>
              {translate('arca.megamind.approve', 'Approve')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void decide(item.id, 'denied')}
            >
              {translate('arca.megamind.deny', 'Deny')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
