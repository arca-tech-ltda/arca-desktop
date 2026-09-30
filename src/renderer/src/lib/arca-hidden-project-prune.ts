import { isArcaProjectExcludedByDefault } from '../../../shared/arca-product'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'

const PRUNED_STORAGE_KEY = 'arca:hiddenProjectsPruned:v1'

export type ArcaPrunableRepo = {
  id: string
  connectionId?: string | null
  executionHostId?: string | null
  gitRemoteIdentity?: { canonicalKey: string } | null
}

export type ArcaHiddenProjectPrune = {
  repoId: string
  repoKey: string
}

/**
 * Registrations of ARCA repos the app hides (the installer-owned `arca`, the legacy `brain`)
 * predate the exclusion, so they linger in the sidebar. Match on the remote identity only —
 * a folder named `arca` that points somewhere else is the user's own project.
 */
export function planArcaHiddenProjectPrune(
  repos: readonly ArcaPrunableRepo[],
  prunedRepoKeys: ReadonlySet<string>
): ArcaHiddenProjectPrune[] {
  const prunes: ArcaHiddenProjectPrune[] = []
  for (const repo of repos) {
    if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    const repoKey = repo.gitRemoteIdentity?.canonicalKey?.trim().toLowerCase()
    if (!repoKey || prunedRepoKeys.has(repoKey)) {
      continue
    }
    if (isArcaProjectExcludedByDefault({ repoKey })) {
      prunes.push({ repoId: repo.id, repoKey })
    }
  }
  return prunes
}

export function readPrunedArcaRepoKeys(): Set<string> {
  if (typeof localStorage === 'undefined') {
    return new Set()
  }
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PRUNED_STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Remembering the key keeps a project the user re-adds on purpose from being removed again. */
export function markArcaRepoKeyPruned(repoKey: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  const pruned = readPrunedArcaRepoKeys()
  pruned.add(repoKey)
  try {
    localStorage.setItem(PRUNED_STORAGE_KEY, JSON.stringify([...pruned]))
  } catch (error) {
    console.warn('Failed to persist pruned ARCA project key:', error)
  }
}
