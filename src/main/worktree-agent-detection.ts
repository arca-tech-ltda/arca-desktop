import { readFileSync, realpathSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import {
  AGENT_WORKTREE_MARKER_FILENAME,
  classifyAgentWorktree,
  type AgentWorktreeInfo
} from '../shared/worktree/agent-worktree'
import type { DetectedWorktree } from '../shared/worktree/types'

/** Temp roots an agent worktree can live under on this host. `/private/tmp` is the macOS
 *  real path behind `/tmp`, and both spellings reach the filesystem. */
export function listAgentWorktreeTempRoots(): string[] {
  const roots = [tmpdir()]
  if (process.platform === 'win32') {
    roots.push(process.env.TEMP ?? '', process.env.TMP ?? '')
  } else {
    roots.push('/tmp')
    if (process.platform === 'darwin') {
      roots.push('/private/tmp')
      try {
        roots.push(realpathSync(tmpdir()))
      } catch {
        // A tmpdir that cannot be resolved just contributes no extra spelling.
      }
    }
  }
  return [...new Set(roots.filter(Boolean))]
}

/** `<worktree>/.git` is a file holding `gitdir: <admin dir>` for every linked worktree; the
 *  main worktree has a directory there and can never be an agent worktree. */
export function readWorktreeAdminDir(worktreePath: string): string | undefined {
  let contents: string
  try {
    contents = readFileSync(join(worktreePath, '.git'), 'utf8')
  } catch {
    return undefined
  }
  const match = contents.match(/^\s*gitdir:\s*(.+?)\s*$/m)
  const gitdir = match?.[1]
  if (!gitdir) {
    return undefined
  }
  return isAbsolute(gitdir) ? gitdir : resolve(worktreePath, gitdir)
}

function readAgentWorktreeMarkerContents(adminDir: string | undefined): string | null {
  if (!adminDir) {
    return null
  }
  try {
    return readFileSync(join(adminDir, AGENT_WORKTREE_MARKER_FILENAME), 'utf8')
  } catch {
    return null
  }
}

function modifiedAt(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/** The admin dir moves on commit/index writes, the checkout on top-level file churn; the later
 *  of the two is the closest cheap stand-in for "the agent touched this". */
function lastAgentWorktreeActivityAt(
  worktreePath: string,
  adminDir: string | undefined
): number | undefined {
  const latest = Math.max(modifiedAt(worktreePath), adminDir ? modifiedAt(adminDir) : 0)
  return latest > 0 ? latest : undefined
}

export function detectAgentWorktree(
  worktreePath: string,
  tempRoots: readonly string[] = listAgentWorktreeTempRoots()
): AgentWorktreeInfo | undefined {
  const adminDir = readWorktreeAdminDir(worktreePath)
  const info = classifyAgentWorktree({
    worktreePath,
    markerContents: readAgentWorktreeMarkerContents(adminDir),
    tempRoots
  })
  if (!info) {
    return undefined
  }
  const lastModifiedAt = lastAgentWorktreeActivityAt(worktreePath, adminDir)
  return lastModifiedAt ? { ...info, lastModifiedAt } : info
}

function isAgentWorktreeCandidate(worktree: DetectedWorktree): boolean {
  return (
    !worktree.selectedCheckout && !worktree.isMainWorktree && worktree.ownership !== 'orca-managed'
  )
}

/** Only for worktrees on this process's own filesystem — an SSH-hosted listing has no local
 *  admin dir to read and no meaningful local temp root. */
export function annotateAgentWorktrees(worktrees: DetectedWorktree[]): DetectedWorktree[] {
  const tempRoots = listAgentWorktreeTempRoots()
  return worktrees.map((worktree) => {
    if (!isAgentWorktreeCandidate(worktree)) {
      return worktree
    }
    const agentWork = detectAgentWorktree(worktree.path, tempRoots)
    return agentWork ? { ...worktree, agentWork } : worktree
  })
}
