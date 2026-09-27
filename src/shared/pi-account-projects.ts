import type { PiAccountProvider } from './pi-accounts'
import {
  isLocalAccountSelectableProject,
  normalizeProjectPathKey,
  resolveProjectSelectionForLaunch
} from './project-account-paths'

export { normalizeProjectPathKey } from './project-account-paths'

export const PI_ACCOUNT_PROJECTS_FILE = 'account-projects.json'
export const PI_ACCOUNT_PROJECTS_VERSION = 1

/** Provider id upper-cased, non-alphanumerics folded to `_` (contract v1). */
export function piAccountEnvKey(provider: PiAccountProvider): string {
  return `PI_ACCOUNT_${provider.toUpperCase().replace(/[^A-Z0-9]/gu, '_')}`
}

export const PI_ACCOUNT_PROVIDERS: readonly PiAccountProvider[] = ['anthropic', 'openai-codex']
export const PI_ACCOUNT_ENV_KEYS: readonly string[] = PI_ACCOUNT_PROVIDERS.map(piAccountEnvKey)

export type PiAccountProjectSelection = Partial<Record<PiAccountProvider, string>>

/**
 * v1 only covers a Pi started on this computer: on SSH and WSL the bucket, the lock and the Pi
 * binary all belong to the execution host, whose own `/accounts` owns the choice.
 */
export function isPiAccountSelectableProject(project: {
  connectionId?: string | null
  path?: string | null
}): boolean {
  return isLocalAccountSelectableProject(project)
}

export type PiAccountProjectMap = {
  version: typeof PI_ACCOUNT_PROJECTS_VERSION
  projects: Record<string, PiAccountProjectSelection>
}

/** A terminal that was opened with a fixed account; the badge and the "in use" guard read it. */
export type PiAccountSession = {
  tabId: string
  provider: PiAccountProvider
  name: string
  worktreeId?: string
}

export type PiAccountProjectsState = {
  /** False until the installed Pi declares support; the UI stays disabled and no env is injected. */
  supported: boolean
  map: PiAccountProjectMap
  sessions: PiAccountSession[]
}

export type PiAccountProjectSetResult = {
  status: 'saved' | 'unsupported' | 'unknown-account'
  state: PiAccountProjectsState
}

export function emptyPiAccountProjectMap(): PiAccountProjectMap {
  return { version: PI_ACCOUNT_PROJECTS_VERSION, projects: {} }
}

/** The account fixed for a project path, if any. Callers pass the project (repo/folder) path. */
export function getPiAccountProjectSelection(
  map: PiAccountProjectMap,
  projectPath: string | null | undefined,
  platform = process.platform
): PiAccountProjectSelection {
  if (!projectPath) {
    return {}
  }
  return map.projects[normalizeProjectPathKey(projectPath, platform)] ?? {}
}

/**
 * The selection for a terminal: the project entry when known, otherwise the longest mapped
 * path containing `cwd` (a worktree checked out inside the project).
 */
export function resolvePiAccountSelectionForLaunch(
  map: PiAccountProjectMap,
  paths: { projectPath?: string | null; cwd?: string | null },
  platform = process.platform
): PiAccountProjectSelection {
  return resolveProjectSelectionForLaunch(map.projects, paths, platform) ?? {}
}

export type PiAccountProjectsApi = {
  get: () => Promise<PiAccountProjectsState>
  set: (
    projectPath: string,
    provider: PiAccountProvider,
    name: string | null
  ) => Promise<PiAccountProjectSetResult>
  /** Renderer-authoritative list of terminal tabs still open; prunes stale badges. */
  syncOpenTabs: (tabIds: string[]) => Promise<PiAccountProjectsState>
  onChange: (callback: (state: PiAccountProjectsState) => void) => () => void
}
