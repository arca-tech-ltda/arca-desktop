import React, { useState } from 'react'
import { Bot, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import NoticeHostGlyph from './NoticeHostGlyph'
import AgentWorktreeGroupRow from './AgentWorktreeGroupRow'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { DetectedWorktree } from '../../../../shared/worktree/types'
import { buildAgentWorktreeRows } from './agent-worktree-rows'
import type { AgentWorktreeInspection } from './agent-worktree-inspection'

type AgentWorktreesGroupLineProps = {
  repoDisplayName: string
  hostContextLabel?: string
  hostContextHostId?: ExecutionHostId
  agentWorktrees: readonly DetectedWorktree[]
  /** Inspection per worktree path; absent entries render as still loading. */
  inspections: ReadonlyMap<string, AgentWorktreeInspection>
  busyWorktreeId: string | null
  confirmingWorktreeId: string | null
  confirmReason: string | null
  error: string | null
  onExpandedChange?: (expanded: boolean) => void
  onOpen: (worktree: DetectedWorktree) => void
  onReviewDiff: (worktree: DetectedWorktree) => void
  onRemove: (worktree: DetectedWorktree, force: boolean) => void
  onCancelConfirm: () => void
  className?: string
}

export default function AgentWorktreesGroupLine({
  repoDisplayName,
  hostContextLabel,
  hostContextHostId,
  agentWorktrees,
  inspections,
  busyWorktreeId,
  confirmingWorktreeId,
  confirmReason,
  error,
  onExpandedChange,
  onOpen,
  onReviewDiff,
  onRemove,
  onCancelConfirm,
  className
}: AgentWorktreesGroupLineProps): React.JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false)
  const rows = buildAgentWorktreeRows(agentWorktrees)
  const worktreeById = new Map(agentWorktrees.map((worktree) => [worktree.id, worktree]))

  if (rows.length === 0) {
    return null
  }

  const lineText =
    rows.length === 1
      ? translate('auto.components.sidebar.AgentWorktreesGroupLine.oneAgent', '1 agent working')
      : translate(
          'auto.components.sidebar.AgentWorktreesGroupLine.manyAgents',
          '{{value0}} agents working',
          { value0: rows.length }
        )

  const toggleExpanded = (): void => {
    setIsExpanded((value) => {
      onExpandedChange?.(!value)
      return !value
    })
  }

  return (
    <section className={cn('mx-1 my-0.5 ml-3 text-worktree-sidebar-foreground', className)}>
      <div
        className={cn(
          'flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] leading-none text-muted-foreground transition-colors',
          'hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? translate(
                  'auto.components.sidebar.AgentWorktreesGroupLine.collapseLabel',
                  'Collapse agent worktrees for {{value0}}',
                  { value0: repoDisplayName }
                )
              : translate(
                  'auto.components.sidebar.AgentWorktreesGroupLine.expandLabel',
                  'Expand agent worktrees for {{value0}}',
                  { value0: repoDisplayName }
                )
          }
          onClick={toggleExpanded}
        >
          <ChevronRight
            className={cn('size-3 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden="true"
          />
        </Button>
        <Bot className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{lineText}</span>
        {hostContextLabel ? (
          <span className="inline-flex min-w-0 shrink items-center gap-1">
            {hostContextHostId ? (
              <NoticeHostGlyph
                hostId={hostContextHostId}
                hostLabel={hostContextLabel}
                keyboardFocusable
              />
            ) : null}
            <span className="min-w-0 truncate text-[10px] leading-none text-muted-foreground">
              {hostContextLabel}
            </span>
          </span>
        ) : null}
      </div>

      {isExpanded ? (
        <ul
          className="ml-4 mt-0.5 grid gap-1 border-l border-worktree-sidebar-border pb-1 pl-2"
          aria-label={translate(
            'auto.components.sidebar.AgentWorktreesGroupLine.listLabel',
            'Agent worktrees'
          )}
        >
          {rows.map((row) => {
            const worktree = worktreeById.get(row.id)
            if (!worktree) {
              return null
            }
            return (
              <AgentWorktreeGroupRow
                key={row.id}
                row={row}
                inspection={inspections.get(row.path)}
                busy={busyWorktreeId === row.id}
                onOpen={() => onOpen(worktree)}
                onReviewDiff={() => onReviewDiff(worktree)}
                onRemove={(force) => onRemove(worktree, force)}
                confirmReason={confirmingWorktreeId === row.id ? confirmReason : null}
                onCancelConfirm={onCancelConfirm}
              />
            )
          })}
        </ul>
      ) : null}

      {error ? (
        <p className="px-1.5 pb-1 pt-0.5 text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

export type { AgentWorktreesGroupLineProps }
