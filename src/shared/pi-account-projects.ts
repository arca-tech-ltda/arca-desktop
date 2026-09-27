import { isWslUncPath } from './wsl-paths'
import type { PiAccountProvider } from './pi-accounts'

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
  return !project.connectionId?.trim() && !isWslUncPath(project.path ?? '')
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

/**
 * Map key for a project path. Windows paths are case- and separator-insensitive, so the same
 * project reached as `C:\Repo` and `c:/repo` must resolve to one entry.
 */
export function normalizeProjectPathKey(path: string, platform = process.platform): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  const separated = platform === 'win32' ? trimmed.replace(/\//gu, '\\') : trimmed
  const separator = platform === 'win32' ? '\\' : '/'
  const withoutTrailing =
    separated.length > 1 && separated.endsWith(separator) && !separated.endsWith(`:${separator}`)
      ? separated.replace(/[\\/]+$/u, '')
      : separated
  return platform === 'win32' ? withoutTrailing.toLowerCase() : withoutTrailing
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
  const direct = getPiAccountProjectSelection(map, paths.projectPath, platform)
  if (Object.keys(direct).length > 0) {
    return direct
  }
  const cwdKey = normalizeProjectPathKey(paths.cwd ?? '', platform)
  if (!cwdKey) {
    return {}
  }
  const separator = platform === 'win32' ? '\\' : '/'
  let best = ''
  for (const key of Object.keys(map.projects)) {
    if (
      key !== cwdKey &&
      !cwdKey.startsWith(key.endsWith(separator) ? key : `${key}${separator}`)
    ) {
      continue
    }
    if (key.length > best.length) {
      best = key
    }
  }
  return best ? map.projects[best] : {}
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
