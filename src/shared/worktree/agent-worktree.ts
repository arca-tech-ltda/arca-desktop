import { relativePathInsideRoot } from '../cross-platform-path'

/** Lives in the worktree's git admin dir (`<git-common-dir>/worktrees/<name>/`), so it is
 *  outside the working tree and never shows up in `git status`. */
export const AGENT_WORKTREE_MARKER_FILENAME = 'arca-agent.json'

export type AgentWorktreeMarker = {
  agent?: string
  task?: string
  createdBy?: string
  createdAt?: number
}

export type AgentWorktreeInfo = AgentWorktreeMarker & {
  /** `marker` is an explicit claim; `temp-dir` is the path heuristic. */
  source: 'marker' | 'temp-dir'
  /** Host-observed mtime of the checkout or its git admin dir. Not part of the marker. */
  lastModifiedAt?: number
}

const MAX_MARKER_FIELD_LENGTH = 500

function readMarkerText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim().slice(0, MAX_MARKER_FIELD_LENGTH)
  return trimmed.length > 0 ? trimmed : undefined
}

function readMarkerTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Returns a marker for any well-formed JSON object; every field is optional, so an
 *  empty `{}` still proves "an agent wrote this". */
export function parseAgentWorktreeMarker(raw: string): AgentWorktreeMarker | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const record: Record<string, unknown> = { ...parsed }
  const agent = readMarkerText(record.agent)
  const task = readMarkerText(record.task)
  const createdBy = readMarkerText(record.createdBy)
  const createdAt = readMarkerTimestamp(record.createdAt)
  return {
    ...(agent ? { agent } : {}),
    ...(task ? { task } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(createdAt ? { createdAt } : {})
  }
}

/** Case folding follows the path flavour: Windows roots fold, POSIX roots do not. */
export function isTempDirWorktreePath(worktreePath: string, tempRoots: readonly string[]): boolean {
  return tempRoots.some((root) => {
    if (!root) {
      return false
    }
    const relative = relativePathInsideRoot(root, worktreePath)
    // Why not `''`: the temp root itself is not a worktree inside it.
    return relative !== null && relative !== ''
  })
}

export function isAgentWorktree(worktree: { agentWork?: AgentWorktreeInfo }): boolean {
  return worktree.agentWork !== undefined
}

export function partitionAgentWorktrees<T extends { agentWork?: AgentWorktreeInfo }>(
  worktrees: readonly T[]
): { agentWorktrees: T[]; otherWorktrees: T[] } {
  const agentWorktrees: T[] = []
  const otherWorktrees: T[] = []
  for (const worktree of worktrees) {
    ;(isAgentWorktree(worktree) ? agentWorktrees : otherWorktrees).push(worktree)
  }
  return { agentWorktrees, otherWorktrees }
}

export function classifyAgentWorktree(args: {
  worktreePath: string
  /** Raw `arca-agent.json` contents, when the admin dir had one. */
  markerContents?: string | null
  tempRoots: readonly string[]
}): AgentWorktreeInfo | undefined {
  const marker = args.markerContents ? parseAgentWorktreeMarker(args.markerContents) : null
  if (marker) {
    return { ...marker, source: 'marker' }
  }
  if (isTempDirWorktreePath(args.worktreePath, args.tempRoots)) {
    return { source: 'temp-dir' }
  }
  return undefined
}
