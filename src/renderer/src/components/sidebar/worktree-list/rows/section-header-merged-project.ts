import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { SidebarTreeModel } from '../../sidebar-tree-model'
import type { GroupHeaderRow } from '../grouping/row-types'

export type MergedProjectHeader = {
  /** Set when this project header stands in for its only worktree. */
  mergedWorktree: Worktree | undefined
  mergedBranchLabel: string | null
  /** The header replaces that worktree's card, so it also owes its selected fill. */
  isActiveMergedWorktree: boolean
  activateMergedWorktree: () => void
}

export function resolveMergedProjectHeader(args: {
  row: GroupHeaderRow
  tree: SidebarTreeModel
  activeWorktreeId: string | null
  onImmediateActivate: (worktreeId: string, rowKey: string | undefined) => void
}): MergedProjectHeader {
  const { row } = args
  const mergedWorktree = args.tree.mergedWorktreeByHeaderKey.get(row.key)
  const identity = mergedWorktree ? getWorktreeGitIdentityDisplay(mergedWorktree) : null
  return {
    mergedWorktree,
    isActiveMergedWorktree:
      mergedWorktree !== undefined && args.activeWorktreeId === mergedWorktree.id,
    mergedBranchLabel:
      identity?.kind === 'branch'
        ? identity.branchName
        : identity?.kind === 'detached'
          ? identity.shortHead
          : null,
    activateMergedWorktree: (): void => {
      if (!mergedWorktree) {
        return
      }
      args.onImmediateActivate(mergedWorktree.id, undefined)
      void activateWorktreeFromSidebar(
        mergedWorktree.id,
        mergedWorktree.hostId ?? (row.repo ? getRepoExecutionHostId(row.repo) : undefined)
      )
    }
  }
}
