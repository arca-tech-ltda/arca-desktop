import {
  isLocalAccountSelectableProject,
  normalizeProjectPathKey,
  resolveProjectSelectionForLaunch
} from './project-account-paths'

/**
 * Per-project managed accounts, the `managed` half of the per-machine agent authority: on a
 * partner's machine the agents are the Claude Code and Codex CLIs, whose accounts the fork already
 * manages (`src/main/claude-accounts`, `src/main/codex-accounts`). Same decisions as the Pi map in
 * `pi-account-projects.ts`, keyed by managed account **id** instead of a bucket account name.
 */
export const MANAGED_ACCOUNT_AGENTS = ['claude', 'codex'] as const
export type ManagedAccountAgent = (typeof MANAGED_ACCOUNT_AGENTS)[number]

export const MANAGED_ACCOUNT_PROJECTS_FILE = 'managed-account-projects.json'
export const MANAGED_ACCOUNT_PROJECTS_VERSION = 1

/** App-private marker read back in main during spawn; the CLI itself never reads it. */
export function managedAccountEnvKey(agent: ManagedAccountAgent): string {
  return `ARCA_MANAGED_ACCOUNT_${agent.toUpperCase()}`
}

export const MANAGED_ACCOUNT_ENV_KEYS: readonly string[] =
  MANAGED_ACCOUNT_AGENTS.map(managedAccountEnvKey)

/** The config home each CLI reads; the pinned account's home is injected under this name. */
export function managedAccountHomeEnvKey(
  agent: ManagedAccountAgent
): 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME' {
  return agent === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME'
}

export type ManagedAccountProjectSelection = Partial<Record<ManagedAccountAgent, string>>

export type ManagedAccountProjectMap = {
  version: typeof MANAGED_ACCOUNT_PROJECTS_VERSION
  projects: Record<string, ManagedAccountProjectSelection>
}

/** A terminal opened on a fixed account; the tab badge and the remove guard read it. */
export type ManagedAccountSession = {
  tabId: string
  agent: ManagedAccountAgent
  accountId: string
  /** Account e-mail at launch time, so a badge never has to re-resolve a removed account. */
  label: string
  worktreeId?: string
}

export type ManagedAccountOption = {
  agent: ManagedAccountAgent
  id: string
  label: string
}

export type ManagedAccountProjectsState = {
  /** False outside `managed` authority; every surface hides the choice and no env is injected. */
  supported: boolean
  map: ManagedAccountProjectMap
  sessions: ManagedAccountSession[]
  /** Host (non-WSL) managed accounts available to pin, newest login first. */
  accounts: ManagedAccountOption[]
}

export type ManagedAccountProjectSetResult = {
  status: 'saved' | 'unsupported' | 'unknown-account'
  state: ManagedAccountProjectsState
}

/** A pinned account that cannot be used blocks the launch; ARCA never falls back in silence. */
export function managedAccountUnavailableMessage(
  agent: ManagedAccountAgent,
  label: string
): string {
  const cli = agent === 'claude' ? 'Claude Code' : 'Codex'
  return `The ${cli} account pinned to this project (${label}) is not available. Sign in again in Settings → Accounts, or pick another account for this project; ARCA will not start this terminal on a different account.`
}

export function emptyManagedAccountProjectMap(): ManagedAccountProjectMap {
  return { version: MANAGED_ACCOUNT_PROJECTS_VERSION, projects: {} }
}

export function isManagedAccountSelectableProject(project: {
  connectionId?: string | null
  path?: string | null
}): boolean {
  return isLocalAccountSelectableProject(project)
}

/** The account fixed for a project path, if any. Callers pass the project (repo/folder) path. */
export function getManagedAccountProjectSelection(
  map: ManagedAccountProjectMap,
  projectPath: string | null | undefined,
  platform = process.platform
): ManagedAccountProjectSelection {
  if (!projectPath) {
    return {}
  }
  return map.projects[normalizeProjectPathKey(projectPath, platform)] ?? {}
}

export function resolveManagedAccountSelectionForLaunch(
  map: ManagedAccountProjectMap,
  paths: { projectPath?: string | null; cwd?: string | null },
  platform = process.platform
): ManagedAccountProjectSelection {
  return resolveProjectSelectionForLaunch(map.projects, paths, platform) ?? {}
}

export type ManagedAccountProjectsApi = {
  get: () => Promise<ManagedAccountProjectsState>
  set: (
    projectPath: string,
    agent: ManagedAccountAgent,
    accountId: string | null
  ) => Promise<ManagedAccountProjectSetResult>
  /** Renderer-authoritative list of terminal tabs still open; prunes stale badges. */
  syncOpenTabs: (tabIds: string[]) => Promise<ManagedAccountProjectsState>
  onChange: (callback: (state: ManagedAccountProjectsState) => void) => () => void
}
