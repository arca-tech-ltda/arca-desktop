import React, { useCallback, useEffect, useState } from 'react'

import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import AgentWorktreesGroupLine from './AgentWorktreesGroupLine'
import type { DetectedWorktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import {
  agentWorktreeRemovalNeedsExtraConfirmation,
  inspectAgentWorktree,
  type AgentWorktreeInspection
} from './agent-worktree-inspection'
import { removeAgentWorktree } from './agent-worktree-removal'
import { importNewExternalWorktreeInboxPaths } from './new-external-worktrees-inbox-actions'

type AgentWorktreesGroupProps = {
  repo: Repo
  agentWorktrees: readonly DetectedWorktree[]
  /** Branch the project's main checkout has out; commits ahead are measured against it. */
  baseRef?: string
  hostContextLabel?: string
  hostContextHostId?: ExecutionHostId
}

function removalFailureMessage(): string {
  return translate(
    'auto.components.sidebar.AgentWorktreesGroup.removeFailed',
    'Could not remove the agent worktree. Try again.'
  )
}

export default function AgentWorktreesGroup({
  repo,
  agentWorktrees,
  baseRef,
  hostContextLabel,
  hostContextHostId
}: AgentWorktreesGroupProps): React.JSX.Element | null {
  const updateRepo = useAppStore((s) => s.updateRepo)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)
  const setRightSidebarOpen = useAppStore((s) => s.setRightSidebarOpen)
  const [expanded, setExpanded] = useState(false)
  const [inspections, setInspections] = useState<Map<string, AgentWorktreeInspection>>(new Map())
  const [busyWorktreeId, setBusyWorktreeId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ id: string; reason: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paths = agentWorktrees.map((worktree) => worktree.path).join('\u0000')

  useEffect(() => {
    if (!expanded) {
      return
    }
    let canceled = false
    void (async () => {
      for (const worktreePath of paths.split('\u0000').filter(Boolean)) {
        const inspection = await inspectAgentWorktree({
          worktreePath,
          ...(baseRef ? { baseRef } : {}),
          git: window.api.git
        })
        if (canceled) {
          return
        }
        setInspections((previous) => new Map(previous).set(worktreePath, inspection))
      }
    })()
    return () => {
      canceled = true
    }
  }, [baseRef, expanded, paths])

  const showInWorktreeList = useCallback(
    async (worktree: DetectedWorktree) => {
      setBusyWorktreeId(worktree.id)
      setError(null)
      await importNewExternalWorktreeInboxPaths({
        projectId: repo.id,
        repo,
        worktreePaths: [worktree.path],
        setInboxState: (_projectId, state) => setError(state?.error ?? null),
        updateRepo,
        fetchWorktrees
      })
      setBusyWorktreeId(null)
    },
    [fetchWorktrees, repo, updateRepo]
  )

  const handleOpen = useCallback(
    async (worktree: DetectedWorktree) => {
      await showInWorktreeList(worktree)
      setActiveWorktree(worktree.id, worktree.hostId)
    },
    [setActiveWorktree, showInWorktreeList]
  )

  const handleReviewDiff = useCallback(
    async (worktree: DetectedWorktree) => {
      await handleOpen(worktree)
      setRightSidebarTab('source-control')
      setRightSidebarOpen(true)
    },
    [handleOpen, setRightSidebarOpen, setRightSidebarTab]
  )

  const handleRemove = useCallback(
    async (worktree: DetectedWorktree, force: boolean) => {
      if (!force && agentWorktreeRemovalNeedsExtraConfirmation(inspections.get(worktree.path))) {
        setConfirming({ id: worktree.id, reason: 'unsaved-work' })
        return
      }
      setBusyWorktreeId(worktree.id)
      setError(null)
      const result = await removeAgentWorktree({
        worktreeId: worktree.id,
        ...(worktree.hostId ? { hostId: worktree.hostId } : {}),
        force,
        remove: window.api.worktrees.remove
      })
      setBusyWorktreeId(null)
      if (result.outcome === 'needs-confirmation') {
        setConfirming({ id: worktree.id, reason: result.reason })
        return
      }
      setConfirming(null)
      if (result.outcome === 'failed') {
        setError(removalFailureMessage())
        return
      }
      await fetchWorktrees(repo.id, { requireAuthoritative: true })
    },
    [fetchWorktrees, inspections, repo.id]
  )

  return (
    <AgentWorktreesGroupLine
      repoDisplayName={repo.displayName}
      {...(hostContextLabel ? { hostContextLabel } : {})}
      {...(hostContextHostId ? { hostContextHostId } : {})}
      agentWorktrees={agentWorktrees}
      inspections={inspections}
      busyWorktreeId={busyWorktreeId}
      confirmingWorktreeId={confirming?.id ?? null}
      confirmReason={confirming?.reason ?? null}
      error={error}
      onExpandedChange={setExpanded}
      onOpen={(worktree) => void handleOpen(worktree)}
      onReviewDiff={(worktree) => void handleReviewDiff(worktree)}
      onRemove={(worktree, force) => void handleRemove(worktree, force)}
      onCancelConfirm={() => setConfirming(null)}
    />
  )
}
