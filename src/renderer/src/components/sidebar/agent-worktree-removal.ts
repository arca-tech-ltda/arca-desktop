import type { ExecutionHostId } from '../../../../shared/execution-host'
import { classifyWorktreeForceDeleteReason } from '../../../../shared/worktree/removal'

export type AgentWorktreeRemovalResult =
  | { outcome: 'removed' }
  | { outcome: 'needs-confirmation'; reason: string }
  | { outcome: 'failed'; error: string }

type RemoveWorktreeCall = (args: {
  worktreeId: string
  hostId?: ExecutionHostId
  force?: boolean
}) => Promise<unknown>

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Removes an agent's worktree with `git worktree remove` semantics. `force` is never
 * inferred — the caller must have confirmed it.
 */
export async function removeAgentWorktree(args: {
  worktreeId: string
  hostId?: ExecutionHostId
  force: boolean
  remove: RemoveWorktreeCall
}): Promise<AgentWorktreeRemovalResult> {
  try {
    await args.remove({
      worktreeId: args.worktreeId,
      ...(args.hostId ? { hostId: args.hostId } : {}),
      ...(args.force ? { force: true } : {})
    })
    return { outcome: 'removed' }
  } catch (error) {
    const message = errorText(error)
    const forceReason = classifyWorktreeForceDeleteReason(message, args.force)
    if (forceReason === 'dirty' || forceReason === 'orphan-directory') {
      return { outcome: 'needs-confirmation', reason: message }
    }
    return { outcome: 'failed', error: message }
  }
}
