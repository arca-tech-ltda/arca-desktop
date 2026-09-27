import { basename } from 'node:path'
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
