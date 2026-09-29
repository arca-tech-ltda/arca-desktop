import React, { useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import { useNow } from '@/hooks/use-now'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import {
  selectSendTargetControlInputs,
  selectSendTargetInputs
} from './worktree-card-send-target-inputs'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import { cn } from '@/lib/utils'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { dismissStaleAgentRowByKey } from '../terminal-pane/stale-agent-row'
import { useFocusedAgentPaneKey } from './focused-agent-row-highlight'
import { CompactAgentExpansion, CompactAgentRow } from './worktree-card-compact-agents'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { SidebarTreeGuide } from './SidebarTreeGuide'
import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '../../../../shared/constants'
import { useWorktreeAgentExpansionState } from './worktree-card-agents-expansion-state'
import { translate } from '@/i18n/i18n'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { selectAcknowledgedAgentTimes } from './worktree-card-agent-ack-inputs'

export const SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT =
  'orca-suppress-worktree-list-scroll-adjustment'

const dispatchSuppressScrollAdjustment = () => {
  window.dispatchEvent(new CustomEvent(SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT))
}

type Props = {
  worktreeId: string
  agents?: DashboardAgentRowData[]
  /** Spacing from the card body above; parent decides whether a divider is appropriate. */
  className?: string
  /** Left offset of the guide rail, so agents line up under their project or branch node. */
  treeIndent?: number
}

/** Inline agent list rendered inside WorktreeCard when 'inline-agents' is enabled. */
const WorktreeCardAgents = React.memo(function WorktreeCardAgents({
  worktreeId,
  agents: precomputedAgents,
  className,
  treeIndent
}: Props) {
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const agents = precomputedAgents ?? selectedAgents
  if (agents.length === 0) {
    return null
  }
  // Why: mount the inner body (owns the 30s useNow tick) only for non-empty rows, so idle worktrees pay no timer cost.
  return (
    <WorktreeCardAgentsBody
      worktreeId={worktreeId}
      agents={agents}
      className={className}
      treeIndent={treeIndent}
    />
  )
})

type BodyProps = {
  worktreeId: string
  agents: DashboardAgentRowData[]
  className?: string
  treeIndent?: number
}

function TreeAgentRow({
  trail,
  isLast,
  children
}: {
  trail: readonly boolean[]
  isLast: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-stretch">
      <SidebarTreeGuide ancestorsContinue={trail} isLast={isLast} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const WorktreeCardAgentsBody = React.memo(function WorktreeCardAgentsBody({
  worktreeId,
  agents,
  className,
  treeIndent
}: BodyProps) {
  const agentActivityDisplayMode =
    useAppStore((s) => s.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const { targetMode: agentSendPopoverTargetMode, agentStatusEpoch } = useAppStore(
    useShallow((s) => selectSendTargetControlInputs(s, worktreeId))
  )
  // Why: return a stable empty constant unless the send-target popover is ours, so churny pane-title/agent-status maps don't re-render idle bodies.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Why: acknowledgement writes are app-global; project only this card's rows
  // so unrelated worktree activity does not rerender every agent body.
  const acknowledgedAgentTimes = useAppStore(
    useShallow((s) => selectAcknowledgedAgentTimes(s, agents))
  )
  const unvisitedByPaneKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [index, agent] of agents.entries()) {
      const ackAt = acknowledgedAgentTimes[index] ?? 0
      out[agent.paneKey] = ackAt < agent.entry.stateStartedAt
    }
    return out
  }, [agents, acknowledgedAgentTimes])

  const handleDismissAgent = useCallback(
    (paneKey: string) => {
      dropAgentStatus(paneKey)
      dismissRetainedAgent(paneKey)
    },
    [dropAgentStatus, dismissRetainedAgent]
  )

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode !== null
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    if (!isAgentSendTargetModeActive) {
      return new Map<
        string,
        { status: 'eligible' | 'disabled' | 'sending'; disabledReason?: string }
      >()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? { status: 'sending' as const, disabledReason: 'Sending...' }
          : target.disabledReason
            ? { status: target.status, disabledReason: target.disabledReason }
            : { status: target.status }
      ])
    )
  }, [
    // Why: stale-boundary timers bump this epoch without replacing the status map, so re-derive when freshness flips.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    // sendTargetInputs: stable empty when inactive, shallow bundle of the five maps when active — one ref covers all five deps.
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => {
      const parsed = parsePaneKey(paneKey)
      if (!parsed) {
        // Why: malformed/legacy numeric keys can't be resolved after pane replay/remount, so drop the stale row instead of guessing.
        console.warn('[WorktreeCardAgents] malformed paneKey, skipping pane focus', paneKey)
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      if (parsed.tabId !== tabId) {
        console.warn('[WorktreeCardAgents] paneKey tabId mismatch, dismissing row', {
          tabId,
          paneKey
        })
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      // Why: design-doc rule — every user-initiated worktree switch must route through activateAndRevealWorktree (cross-repo activation + nav history).
      activateAndRevealWorktree(worktreeId)
      const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
      if (tabs.some((t) => t.id === tabId)) {
        activateTabAndFocusPane(tabId, parsed.leafId, {
          ackPaneKeyOnSuccess: paneKey,
          flashFocusedPane: true,
          scrollToBottomIfOutputSinceLastView: true
        })
      } else if (!activateStructuredAgentSessionTab({ worktreeId, tabId })) {
        const liveEntry = useAppStore.getState().agentStatusByPaneKey[paneKey]
        if (liveEntry?.worktreeId === worktreeId) {
          // Why: orchestration worker status can be worktree-attributed before the renderer knows its tab; keep the live row instead of dismissing as stale.
          return
        }
        dismissStaleAgentRowByKey(paneKey)
      }
    },
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(() => {
    // Why: hibernation-retained rows are passive completion evidence; activating would resume sleeping sessions, so the row is inert.
  }, [])

  // Why: one 30s tick per non-empty inline list; zero-agent cards never mount this (see WorktreeCardAgents), so idle worktrees pay no timer cost.
  const now = useNow(30_000)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => buildAgentRowLineageTree(agents),
    [agents]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  // Why: keep disclosure state out of local useState so a WorktreeCard remount (virtualizer recycle / sibling toggle) doesn't reset it.
  const { collapsedLineageParents, toggleLineageParent: toggleLineageParentState } =
    useWorktreeAgentExpansionState(worktreeId)

  const toggleLineageParent = useCallback(
    (paneKey: string) => {
      dispatchSuppressScrollAdjustment()
      toggleLineageParentState(paneKey)
    },
    [toggleLineageParentState]
  )

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const renderAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    trail: readonly boolean[] = [],
    isLast = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      // Why: orchestration metadata is external and can be malformed; bail on repeated ancestors instead of recursing forever.
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    // Why: running subagents are the whole disclosure — they vanish on their own
    // when they finish, so a chevron would only ever hide live work.
    const childrenAreSubagents =
      hasChildAgents && childAgents.every((child) => child.rowSource === 'subagent')
    // Why: spawned child agents are actionable work, so show them as soon as the parent appears (disclosure still folds noise).
    const expanded = childrenAreSubagents || !collapsedLineageParents.has(agent.paneKey)
    const childTrail = [...trail, !isLast]
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: 'Agent is not available'
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <TreeAgentRow trail={trail} isLast={isLast}>
          <DashboardAgentRow
            agent={agent}
            onDismiss={handleDismissAgent}
            onActivate={
              agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
            }
            now={now}
            // Why: bold the row until the user visits its tab (useAutoAckViewedAgent auto-acks on focus, muting it).
            isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
            // Why: inline rows are tight; 'md' reads as a second glyph users confuse with the adjacent identity icon, so use 'sm'.
            stateDotSize="sm"
            // Why: clicking the row jumps straight to the agent, so the expand chevron is redundant (keep the identity glyph).
            hideExpand
            childAgentCount={
              hasChildAgents && !childrenAreSubagents ? childAgents.length : undefined
            }
            childAgentsExpanded={expanded}
            onToggleChildAgents={
              hasChildAgents && !childrenAreSubagents
                ? () => toggleLineageParent(agent.paneKey)
                : undefined
            }
            isFocusedPane={agent.paneKey === focusedAgentPaneKey}
            sendTargetStatus={sendTarget?.status}
            sendTargetDisabledReason={sendTarget?.disabledReason}
            onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
            // Why: the guide rail owns hierarchy now; the legacy L-connectors use a fixed offset off this grid.
            hideLineageConnectors
          />
        </TreeAgentRow>
        {hasChildAgents && expanded
          ? childAgents.map((childAgent, childIndex) =>
              renderAgentBranch(
                childAgent,
                descendantAncestorPaneKeys,
                childTrail,
                childIndex === childAgents.length - 1
              )
            )
          : null}
      </React.Fragment>
    )
  }

  const renderCompactAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    cacheTimerActive = true,
    trail: readonly boolean[] = [],
    isLast = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const childrenAreSubagents =
      hasChildAgents && childAgents.every((child) => child.rowSource === 'subagent')
    const expanded = childrenAreSubagents || !collapsedLineageParents.has(agent.paneKey)
    const childTrail = [...trail, !isLast]
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: 'Agent is not available'
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    const childNodes = childAgents.map((childAgent, childIndex) =>
      renderCompactAgentBranch(
        childAgent,
        descendantAncestorPaneKeys,
        cacheTimerActive && expanded,
        childTrail,
        childIndex === childAgents.length - 1
      )
    )
    return (
      <React.Fragment key={agent.paneKey}>
        <TreeAgentRow trail={trail} isLast={isLast}>
          <CompactAgentRow
            agent={agent}
            now={now}
            onActivate={
              agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
            }
            sendTargetStatus={sendTarget?.status}
            sendTargetDisabledReason={sendTarget?.disabledReason}
            onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
            childAgentCount={
              hasChildAgents && !childrenAreSubagents ? childAgents.length : undefined
            }
            childAgentsExpanded={expanded}
            onToggleChildAgents={
              hasChildAgents && !childrenAreSubagents
                ? () => toggleLineageParent(agent.paneKey)
                : undefined
            }
            isFocusedPane={agent.paneKey === focusedAgentPaneKey}
            cacheTimerActive={cacheTimerActive}
          />
        </TreeAgentRow>
        {!hasChildAgents ? null : childrenAreSubagents ? (
          <div className="flex flex-col gap-0.5">{childNodes}</div>
        ) : (
          <CompactAgentExpansion expanded={expanded}>
            <div className="flex flex-col gap-0.5">{childNodes}</div>
          </CompactAgentExpansion>
        )}
      </React.Fragment>
    )
  }

  if (agentActivityDisplayMode === 'compact') {
    return (
      <div
        ref={compactAgentListRootRef}
        className={cn('flex flex-col mt-1 gap-0.5', className)}
        style={treeIndent ? { paddingLeft: `${treeIndent}px` } : undefined}
        onClick={stopBubble}
        onDoubleClick={stopBubble}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
        role={hasLineage ? 'tree' : 'group'}
        aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
        data-compact-agent-list="true"
      >
        {/* Why: every agent is its own tree node; a "N agents" summary pill would
            hide exactly the states the tree exists to show. */}
        {rootAgents.map((rootAgent, index) =>
          renderCompactAgentBranch(rootAgent, new Set(), true, [], index === rootAgents.length - 1)
        )}
      </div>
    )
  }

  return (
    // Why: swallow bubbling so gutter clicks don't reach WorktreeCard's activate / edit-meta handlers.
    <div
      className={cn('flex flex-col mt-1', className)}
      style={treeIndent ? { paddingLeft: `${treeIndent}px` } : undefined}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
    >
      {rootAgents.map((rootAgent, index) =>
        renderAgentBranch(rootAgent, new Set(), [], index === rootAgents.length - 1)
      )}
    </div>
  )
})

export default WorktreeCardAgents
