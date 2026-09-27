import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  decideMegamindApproval,
  megamindApprovalsSnapshot,
  refreshMegamindApprovals,
  subscribeMegamindApprovals,
  type MegamindApprovalsProblem
} from '@/attention/megamind-approvals-store'
import { megamindApprovalTarget } from '@/attention/megamind-events'
import { megamindPanelRoute } from '@/attention/megamind-panel-route'

function problemMessage(problem: MegamindApprovalsProblem): string {
  switch (problem) {
    case 'transport':
      return translate(
        'arca.megamind.approvalsError',
        'Could not read approvals. Check your connection.'
      )
    case 'forbidden':
      return translate('arca.megamind.approvalForbidden', 'This approval is not yours to decide.')
    case 'conflict':
      return translate(
        'arca.megamind.approvalConflict',
        'That approval was already decided or expired.'
      )
    case 'rate':
      return translate(
        'arca.megamind.approvalRateLimited',
        'Too many decisions at once. Wait a moment and try again.'
      )
    case 'decide':
      return translate('arca.megamind.approvalFailed', 'The decision did not go through.')
  }
}

export function MegamindApprovalsTab(): React.JSX.Element {
  const state = useSyncExternalStore(subscribeMegamindApprovals, megamindApprovalsSnapshot)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    refreshMegamindApprovals()
  }, [])
  // A notification or deep link names one approval; bring it into view.
  useEffect(() => {
    const id = megamindPanelRoute().approvalId ?? megamindApprovalTarget()
    if (id) {
      document.getElementById(`megamind-approval-${id}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [state.items])
  const decide = async (id: string, decision: 'approved' | 'denied'): Promise<void> => {
    setBusy(true)
    try {
      await decideMegamindApproval(id, decision)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
      {state.login && (
        <div className="flex flex-col items-start gap-1" role="status">
          <p>
            {translate(
              'arca.megamind.loginRequired',
              'Sign in to Mainframe, then retry your decision.'
            )}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void window.api.arcaMegamind.openMainframeLogin()}
          >
            {translate('arca.megamind.signIn', 'Sign in')}
          </Button>
        </div>
      )}
      {state.problem && <p role="alert">{problemMessage(state.problem)}</p>}
      {state.items.length === 0 && !state.login && !state.problem && (
        <p className="p-2 text-center text-muted-foreground">
          {translate('arca.megamind.approvalsEmpty', 'No approvals waiting for you.')}
        </p>
      )}
      {state.items.map((item) => (
        <div
          key={item.id}
          id={`megamind-approval-${item.id}`}
          className="flex flex-col gap-1 rounded-md border border-border p-2"
        >
          <p className="break-words">{item.summary}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              disabled={busy}
              onClick={() => void decide(item.id, 'approved')}
            >
              {translate('arca.megamind.approve', 'Approve')}
            </Button>
            <Button
              type="button"
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
