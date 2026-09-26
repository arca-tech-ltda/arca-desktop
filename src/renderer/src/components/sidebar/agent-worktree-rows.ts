import type { DetectedWorktree } from '../../../../shared/worktree/types'
import type { AgentWorktreeInfo } from '../../../../shared/worktree/agent-worktree'

export type AgentWorktreeRow = {
  id: string
  path: string
  /** Marker task when the agent wrote one, otherwise the branch or folder name. */
  title: string
  branch: string
  agent?: string
  createdBy?: string
  /** Marker `createdAt` when present, otherwise the host-observed mtime. */
  activityAt?: number
  activityKind: 'started' | 'updated'
}

export function shortBranchName(branch: string): string {
  return branch.replace(/^refs\/(?:heads|remotes)\//, '')
}

function rowTitle(worktree: DetectedWorktree, agentWork: AgentWorktreeInfo): string {
  return agentWork.task ?? shortBranchName(worktree.branch) ?? worktree.displayName
}

export function buildAgentWorktreeRows(worktrees: readonly DetectedWorktree[]): AgentWorktreeRow[] {
  const rows: AgentWorktreeRow[] = []
  for (const worktree of worktrees) {
    const agentWork = worktree.agentWork
    if (!agentWork) {
      continue
    }
    rows.push({
      id: worktree.id,
      path: worktree.path,
      title: rowTitle(worktree, agentWork) || worktree.displayName,
      branch: shortBranchName(worktree.branch ?? ''),
      ...(agentWork.agent ? { agent: agentWork.agent } : {}),
      ...(agentWork.createdBy ? { createdBy: agentWork.createdBy } : {}),
      ...(agentWork.createdAt
        ? { activityAt: agentWork.createdAt, activityKind: 'started' as const }
        : {
            ...(agentWork.lastModifiedAt ? { activityAt: agentWork.lastModifiedAt } : {}),
            activityKind: 'updated' as const
          })
    })
  }
  return rows
}

/** The branch the group measures "commits ahead" against: whatever the project's main
 *  checkout has out. */
export function resolveAgentWorktreeBaseRef(
  worktrees: readonly DetectedWorktree[]
): string | undefined {
  const main = worktrees.find((worktree) => worktree.isMainWorktree)
  const branch = main?.branch ? shortBranchName(main.branch) : ''
  return branch || undefined
}
