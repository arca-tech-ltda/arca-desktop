import React, { useState } from 'react'
import { FolderOpen, GitCompare, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import type { AgentWorktreeRow } from './agent-worktree-rows'
import type { AgentWorktreeInspection } from './agent-worktree-inspection'

type AgentWorktreeGroupRowProps = {
  row: AgentWorktreeRow
  inspection: AgentWorktreeInspection | undefined
  busy: boolean
  onOpen: () => void
  onReviewDiff: () => void
  onRemove: (force: boolean) => void
  /** Set while this row's removal is waiting for the destructive confirmation. */
  confirmReason: string | null
  onCancelConfirm: () => void
}

function activityLabel(row: AgentWorktreeRow): string | null {
  if (!row.activityAt) {
    return null
  }
  const relative = formatUiRelativeTime(row.activityAt - Date.now())
  return row.activityKind === 'started'
    ? translate('auto.components.sidebar.AgentWorktreeGroupRow.started', 'started {{value0}}', {
        value0: relative
      })
    : translate('auto.components.sidebar.AgentWorktreeGroupRow.updated', 'updated {{value0}}', {
        value0: relative
      })
}

function StateSummary({
  inspection
}: {
  inspection: AgentWorktreeInspection | undefined
}): React.JSX.Element | null {
  if (!inspection || inspection.state === 'loading') {
    return (
      <span className="shrink-0">
        {translate('auto.components.sidebar.AgentWorktreeGroupRow.checking', 'checking…')}
      </span>
    )
  }
  if (inspection.state === 'failed') {
    return (
      <span className="shrink-0">
        {translate('auto.components.sidebar.AgentWorktreeGroupRow.unknownState', 'state unknown')}
      </span>
    )
  }
  const parts: string[] = []
  if (inspection.commitsAhead !== undefined) {
    parts.push(
      translate('auto.components.sidebar.AgentWorktreeGroupRow.commitsAhead', '{{value0}} ahead', {
        value0: inspection.commitsAhead
      })
    )
  }
  parts.push(
    (inspection.uncommittedChanges ?? 0) > 0
      ? translate(
          'auto.components.sidebar.AgentWorktreeGroupRow.uncommitted',
          '{{value0}} uncommitted',
          { value0: inspection.uncommittedChanges }
        )
      : translate('auto.components.sidebar.AgentWorktreeGroupRow.clean', 'clean')
  )
  return <span className="shrink-0">{parts.join(' · ')}</span>
}

export default function AgentWorktreeGroupRow({
  row,
  inspection,
  busy,
  onOpen,
  onReviewDiff,
  onRemove,
  confirmReason,
  onCancelConfirm
}: AgentWorktreeGroupRowProps): React.JSX.Element {
  const [showPath, setShowPath] = useState(false)
  const activity = activityLabel(row)
  return (
    <li className="grid min-w-0 gap-0.5 rounded-md px-1.5 py-1">
      <Tooltip open={showPath} onOpenChange={setShowPath}>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="block min-w-0 truncate text-[11px] font-medium leading-4 outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
          >
            {row.title}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {row.path}
        </TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] leading-4 text-muted-foreground">
        {row.agent ? <span className="shrink-0">{row.agent}</span> : null}
        {row.branch ? <span className="min-w-0 truncate font-mono">{row.branch}</span> : null}
        <StateSummary inspection={inspection} />
        {activity ? <span className="shrink-0">{activity}</span> : null}
      </div>
      {confirmReason ? (
        <div className="grid gap-1 pt-0.5">
          <p className="text-[10px] leading-4 text-destructive" role="alert">
            {translate(
              'auto.components.sidebar.AgentWorktreeGroupRow.confirmRemove',
              'This worktree has work that is not saved anywhere else. Remove it anyway?'
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="destructive"
              size="xs"
              disabled={busy}
              onClick={() => onRemove(true)}
            >
              {translate(
                'auto.components.sidebar.AgentWorktreeGroupRow.confirmRemoveAction',
                'Remove anyway'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={onCancelConfirm}
            >
              {translate('auto.components.sidebar.AgentWorktreeGroupRow.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={onOpen}
          >
            <FolderOpen className="size-3" aria-hidden="true" />
            {translate('auto.components.sidebar.AgentWorktreeGroupRow.open', 'Open')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={onReviewDiff}
          >
            <GitCompare className="size-3" aria-hidden="true" />
            {translate('auto.components.sidebar.AgentWorktreeGroupRow.reviewDiff', 'Review diff')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => onRemove(false)}
            aria-label={translate(
              'auto.components.sidebar.AgentWorktreeGroupRow.removeWorktree',
              'Remove worktree {{value0}}',
              { value0: row.title }
            )}
          >
            <Trash2 className="size-3" aria-hidden="true" />
            {translate('auto.components.sidebar.AgentWorktreeGroupRow.remove', 'Remove')}
          </Button>
        </div>
      )}
    </li>
  )
}
