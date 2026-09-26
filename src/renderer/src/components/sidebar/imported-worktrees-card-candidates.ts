import type {
  GlobalSettings,
  WorktreeVisibilityDefaults
} from '../../../../shared/global-settings-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getRepoOwnerWorktreeVisibilityDefaults } from '../../store/worktree-visibility-defaults-by-host'
import type { Repo } from '../../../../shared/repo-types'
import type { DetectedWorktreeListResult, Worktree } from '../../../../shared/worktree/types'
import { getHiddenExternalWorktrees } from '../../../../shared/external-worktree-inbox'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '../../../../shared/worktree/ownership'
import { partitionAgentWorktrees } from '../../../../shared/worktree/agent-worktree'
import { resolveAgentWorktreeBaseRef } from './agent-worktree-rows'
import type { ImportedWorktreesCardCandidate } from './worktree-list/grouping/row-types'

export function getHiddenImportedWorktrees(
  detected: DetectedWorktreeListResult | undefined
): ReturnType<typeof getHiddenExternalWorktrees> {
  return getHiddenExternalWorktrees(detected)
}

export function buildImportedWorktreesCardCandidates(args: {
  repos: readonly Repo[]
  visibleWorktrees?: readonly Worktree[]
  detectedWorktreesByRepo: Readonly<Record<string, DetectedWorktreeListResult | undefined>>
  filterRepoIds?: readonly string[]
  forceVisibleRepoIds?: ReadonlySet<string>
  settings?: Pick<GlobalSettings, 'worktreeVisibilityDefaults'> | null
  visibilityDefaultsByHost?: Partial<Record<ExecutionHostId, WorktreeVisibilityDefaults | null>>
}): Map<string, ImportedWorktreesCardCandidate> {
  const visibleRepoIds = args.visibleWorktrees
    ? new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
    : null
  const filterRepoIds = args.filterRepoIds?.length ? new Set(args.filterRepoIds) : null
  const candidates = new Map<string, ImportedWorktreesCardCandidate>()
  for (const repo of args.repos) {
    if (filterRepoIds && !filterRepoIds.has(repo.id)) {
      continue
    }
    if (visibleRepoIds && !visibleRepoIds.has(repo.id)) {
      continue
    }
    if (!isGitRepoKind(repo)) {
      continue
    }
    const visibility = effectiveExternalWorktreeVisibility(
      repo,
      isLegacyRepoForExternalWorktreeVisibility(repo),
      getRepoOwnerWorktreeVisibilityDefaults(
        repo,
        args.settings,
        args.visibilityDefaultsByHost ?? {}
      )
    )
    const detected = args.detectedWorktreesByRepo[repo.id]
    const { agentWorktrees, otherWorktrees } = partitionAgentWorktrees(
      getHiddenImportedWorktrees(detected)
    )
    // Agent worktrees are never prompted about, so they outlive both the dismissal and the
    // hide/show policy the discovery prompt is gated on.
    const promptsDiscovery =
      typeof repo.externalWorktreeVisibilityPromptDismissedAt !== 'number' &&
      (visibility === 'hide' || args.forceVisibleRepoIds?.has(repo.id) === true)
    const hiddenWorktrees = promptsDiscovery ? otherWorktrees : []
    if (agentWorktrees.length > 0 || hiddenWorktrees.length > 0) {
      const agentBaseRef = resolveAgentWorktreeBaseRef(detected?.worktrees ?? [])
      candidates.set(repo.id, {
        repo,
        hiddenWorktrees,
        agentWorktrees,
        ...(agentBaseRef ? { agentBaseRef } : {})
      })
    }
  }
  return candidates
}
