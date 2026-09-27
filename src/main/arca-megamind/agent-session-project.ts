import { readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { gitExecFileAsync } from '../git/runner'
import { normalizeArcaRemote } from '../arca-projects-sync/catalog'
import type { MegamindRecord } from '../../shared/arca-megamind'

export type MegamindWorkspaceFacts = {
  /** Repository root (or the cwd itself for a plain folder workspace). */
  root: string
  /** `host/owner/name` of `origin`, or null when the folder has no git remote. */
  repoKey: string | null
  branch: string | null
}

export type MegamindProjectResolution = MegamindWorkspaceFacts & { projectId: string }

const PROJECT_ID_FALLBACK = 'arca'

/** `project_id` of the contract: `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` (§2.2). */
export function sanitizeMegamindProjectId(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 64)
  return cleaned || PROJECT_ID_FALLBACK
}

/** Repo keys of a `projects_list` page, keyed by the project id that owns them. */
export function indexProjectsByRepoKey(items: MegamindRecord[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const item of items) {
    if (typeof item.id !== 'string' || !item.id || !Array.isArray(item.repos)) {
      continue
    }
    for (const repo of item.repos) {
      const key = typeof repo === 'string' ? normalizeArcaRemote(repo) : null
      if (key && !index.has(key)) {
        index.set(key, sanitizeMegamindProjectId(item.id))
      }
    }
  }
  return index
}

export async function readWorkspaceFacts(cwd: string): Promise<MegamindWorkspaceFacts> {
  const git = async (args: string[]): Promise<string | null> => {
    try {
      const { stdout } = await gitExecFileAsync(args, { cwd, timeout: 3_000 })
      const value = stdout.trim()
      return value || null
    } catch {
      return null
    }
  }
  const root = (await git(['rev-parse', '--show-toplevel'])) ?? cwd
  const remote = await git(['remote', 'get-url', 'origin'])
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return {
    root,
    repoKey: remote ? normalizeArcaRemote(remote) : null,
    // `branch` of the contract: ≤120 chars, no spaces.
    branch: branch && branch !== 'HEAD' && !/\s/.test(branch) ? branch.slice(0, 120) : null
  }
}

/** `<gitdir>/HEAD` of a workspace: a plain dir, a worktree/submodule `.git` file, or null. */
export function resolveHeadFilePath(root: string): string | null {
  const dotGit = join(root, '.git')
  const stats = statSync(dotGit, { throwIfNoEntry: false })
  if (!stats) {
    return null
  }
  if (stats.isDirectory()) {
    return join(dotGit, 'HEAD')
  }
  try {
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf-8'))?.[1]?.trim()
    return pointer ? join(isAbsolute(pointer) ? pointer : resolve(root, pointer), 'HEAD') : null
  } catch {
    return null
  }
}

function headStamp(root: string): number | null {
  const headPath = resolveHeadFilePath(root)
  return headPath ? (statSync(headPath, { throwIfNoEntry: false })?.mtimeMs ?? null) : null
}

/** Panes are few, but a runaway cwd set must not pin memory. */
const FACTS_CACHE_LIMIT = 64

/**
 * Same facts, without the three `git` spawns on every prompt. `.git/HEAD` is rewritten by a branch
 * switch (and by a worktree move), so its mtime is enough to invalidate a hit; a workspace with no
 * readable HEAD is simply never cached.
 */
export function createCachedWorkspaceFactsReader(
  read: (cwd: string) => Promise<MegamindWorkspaceFacts> = readWorkspaceFacts,
  stampOf: (root: string) => number | null = headStamp
): (cwd: string) => Promise<MegamindWorkspaceFacts> {
  const cache = new Map<string, { facts: MegamindWorkspaceFacts; stamp: number }>()
  return async (cwd: string) => {
    const hit = cache.get(cwd)
    if (hit && stampOf(hit.facts.root) === hit.stamp) {
      return hit.facts
    }
    const facts = await read(cwd)
    const stamp = stampOf(facts.root)
    cache.delete(cwd)
    if (stamp !== null) {
      if (cache.size >= FACTS_CACHE_LIMIT) {
        cache.delete(cache.keys().next().value!)
      }
      cache.set(cwd, { facts, stamp })
    }
    return facts
  }
}

/**
 * Project of a terminal: the catalog project that owns the repo's `origin`, else the repo folder
 * name. The MCP proxy resolves the same way from `projects.json`, so both sides of one pane agree.
 */
export function resolveProjectId(
  facts: MegamindWorkspaceFacts,
  projectsByRepoKey: Map<string, string>
): string {
  const matched = facts.repoKey ? projectsByRepoKey.get(facts.repoKey) : undefined
  return matched ?? sanitizeMegamindProjectId(basename(facts.root))
}
