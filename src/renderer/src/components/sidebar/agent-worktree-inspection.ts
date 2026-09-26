import type { GitBranchCompareResult } from '../../../../shared/git-diff-compare-types'
import type { GitStatusResult } from '../../../../shared/git-status-types'

export type AgentWorktreeInspection = {
  state: 'loading' | 'ready' | 'failed'
  uncommittedChanges?: number
  commitsAhead?: number
}

type AgentWorktreeInspectionGit = {
  status: (args: {
    worktreePath: string
    admissionTier?: 'interactive' | 'status' | 'background'
    includeLineStats?: boolean
  }) => Promise<Pick<GitStatusResult, 'entries' | 'statusLength' | 'upstreamStatus'>>
  branchCompare: (args: {
    worktreePath: string
    baseRef: string
    admissionTier?: 'interactive' | 'status' | 'background'
  }) => Promise<GitBranchCompareResult>
}

function uncommittedChangeCount(status: Pick<GitStatusResult, 'entries' | 'statusLength'>): number {
  return Math.max(status.entries.length, status.statusLength ?? 0)
}

/** Ahead-of-base when a base ref resolves, otherwise ahead-of-upstream; `undefined` when
 *  neither comparison is available (a fresh branch with no base and no upstream). */
function commitsAheadOf(
  compare: GitBranchCompareResult | null,
  status: Pick<GitStatusResult, 'upstreamStatus'> | null
): number | undefined {
  if (compare?.summary.status === 'ready' && compare.summary.commitsAhead !== undefined) {
    return compare.summary.commitsAhead
  }
  return status?.upstreamStatus?.hasUpstream ? status.upstreamStatus.ahead : undefined
}

export async function inspectAgentWorktree(args: {
  worktreePath: string
  baseRef?: string
  git: AgentWorktreeInspectionGit
}): Promise<AgentWorktreeInspection> {
  const [statusResult, compareResult] = await Promise.allSettled([
    args.git.status({
      worktreePath: args.worktreePath,
      admissionTier: 'background',
      includeLineStats: false
    }),
    args.baseRef
      ? args.git.branchCompare({
          worktreePath: args.worktreePath,
          baseRef: args.baseRef,
          admissionTier: 'background'
        })
      : Promise.resolve(null)
  ])
  if (statusResult.status === 'rejected') {
    return { state: 'failed' }
  }
  const compare = compareResult.status === 'fulfilled' ? compareResult.value : null
  const commitsAhead = commitsAheadOf(compare, statusResult.value)
  return {
    state: 'ready',
    uncommittedChanges: uncommittedChangeCount(statusResult.value),
    ...(commitsAhead === undefined ? {} : { commitsAhead })
  }
}

/** Removing this is destructive beyond a plain `git worktree remove`, so the group asks first. */
export function agentWorktreeRemovalNeedsExtraConfirmation(
  inspection: AgentWorktreeInspection | undefined
): boolean {
  if (!inspection || inspection.state !== 'ready') {
    // An unknown state is treated as risky on purpose.
    return true
  }
  return (inspection.uncommittedChanges ?? 0) > 0 || (inspection.commitsAhead ?? 0) > 0
}
