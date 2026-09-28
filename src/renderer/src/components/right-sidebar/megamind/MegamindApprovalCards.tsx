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

/** Nothing is drawn while no one is waiting on the user: approvals are an interruption, not a tab. */
export function MegamindApprovalCards(): React.JSX.Element | null {
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
  if (state.items.length === 0 && !state.login && !state.problem) {
    return null
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-2">
      {state.login && (
        <div className="flex items-center gap-2" role="status">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
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
      {state.problem && (
        <p role="alert" className="text-xs text-destructive">
          {problemMessage(state.problem)}
        </p>
      )}
      {state.items.map((item) => (
        <div
          key={item.id}
          id={`megamind-approval-${item.id}`}
          className="flex flex-col gap-2 rounded-lg bg-accent/60 p-3 shadow-xs"
        >
          <p className="text-xs leading-relaxed font-medium break-words text-foreground">
            {item.summary}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              className="active:scale-[0.96]"
              disabled={busy}
              onClick={() => void decide(item.id, 'approved')}
            >
              {translate('arca.megamind.approve', 'Approve')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="active:scale-[0.96]"
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
