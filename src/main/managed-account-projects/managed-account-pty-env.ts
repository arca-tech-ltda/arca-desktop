import {
  isManagedAccountSelectableProject,
  managedAccountEnvKey,
  managedAccountUnavailableMessage,
  MANAGED_ACCOUNT_AGENTS,
  type ManagedAccountAgent
} from '../../shared/managed-account-projects'
import { getAgentAuthorityMode } from '../agent-authority/agent-authority-state'
import {
  getManagedAccountProjectsService,
  type ManagedAccountProjectsService
} from './managed-account-project-map'
import {
  materializeClaudeManagedCredential,
  prepareClaudeManagedConfigDirForLaunch
} from './managed-account-homes'

export type ManagedAccountPtyEnvInput = {
  /** Project (repo or folder workspace) path; the mapping key. */
  projectPath?: string | null
  cwd?: string | null
  /** SSH target. Anything non-null means the accounts live on another host. */
  connectionId?: string | null
  /** WSL runs its own CLI and its own credentials inside the guest. */
  isWsl?: boolean
  tabId?: string | null
  worktreeId?: string | null
  /** Env already assembled for this PTY; an explicit choice ("New Claude with account…") wins. */
  existingEnv?: Record<string, string> | undefined
  service?: ManagedAccountProjectsService | null
}

function isLocalHostLaunch(input: ManagedAccountPtyEnvInput): boolean {
  return (
    input.isWsl !== true &&
    isManagedAccountSelectableProject({ connectionId: input.connectionId, path: input.cwd }) &&
    isManagedAccountSelectableProject({
      connectionId: input.connectionId,
      path: input.projectPath
    })
  )
}

/** The account each agent should launch on: explicit per-terminal choice first, then the project. */
export function resolveManagedAccountPins(
  input: ManagedAccountPtyEnvInput
): Partial<Record<ManagedAccountAgent, string>> {
  const service = input.service ?? getManagedAccountProjectsService()
  if (!service || getAgentAuthorityMode() !== 'managed' || !isLocalHostLaunch(input)) {
    return {}
  }
  const selection = service.resolveSelection({
    projectPath: input.projectPath,
    cwd: input.cwd
  })
  const pins: Partial<Record<ManagedAccountAgent, string>> = {}
  for (const agent of MANAGED_ACCOUNT_AGENTS) {
    const accountId = input.existingEnv?.[managedAccountEnvKey(agent)] ?? selection[agent]
    if (accountId) {
      pins[agent] = accountId
    }
  }
  return pins
}

/**
 * Per-project managed accounts for a terminal (`managed` authority only, local host only).
 *
 * Claude gets its `CLAUDE_CONFIG_DIR` here, after that home is completed with the app's hooks, the
 * user's MCP servers and skills. Codex only gets the app-private marker: its home is resolved by
 * the Codex launch preparation, which already owns per-account homes, hook install and config
 * mirroring. Also records the account so the tab badge and the remove/rename guards can see what
 * this terminal actually started on.
 */
export function applyManagedAccountPtyEnv(
  env: Record<string, string>,
  input: ManagedAccountPtyEnvInput
): void {
  if (!isLocalHostLaunch(input) || getAgentAuthorityMode() !== 'managed') {
    // Defence in depth: an account of this computer means nothing on the other host.
    for (const agent of MANAGED_ACCOUNT_AGENTS) {
      delete env[managedAccountEnvKey(agent)]
    }
    return
  }
  const service = input.service ?? getManagedAccountProjectsService()
  if (!service) {
    return
  }
  const pins = resolveManagedAccountPins({ ...input, existingEnv: env, service })
  for (const agent of MANAGED_ACCOUNT_AGENTS) {
    const accountId = pins[agent]
    if (!accountId) {
      continue
    }
    const label = service.accountLabel(agent, accountId)
    if (!service.hasAccount(agent, accountId)) {
      throw new Error(managedAccountUnavailableMessage(agent, label))
    }
    env[managedAccountEnvKey(agent)] = accountId
    if (agent === 'claude') {
      const configDir = prepareClaudeManagedConfigDirForLaunch(accountId)
      if (!configDir) {
        throw new Error(managedAccountUnavailableMessage(agent, label))
      }
      env.CLAUDE_CONFIG_DIR = configDir
      // Why: newer Claude scopes its macOS secure storage by this dir; keep both names in step.
      env.CLAUDE_SECURESTORAGE_CONFIG_DIR = configDir
    }
    if (input.tabId) {
      service.recordSession({
        tabId: input.tabId,
        agent,
        accountId,
        label,
        ...(input.worktreeId ? { worktreeId: input.worktreeId } : {})
      })
    }
  }
}

/**
 * Same decision, plus the macOS Keychain item Claude reads for the pinned config dir. Awaited on
 * the IPC spawn path; the synchronous runtime path relies on the same materialization having run
 * when the pin was saved.
 */
export async function applyManagedAccountPtyEnvAsync(
  env: Record<string, string>,
  input: ManagedAccountPtyEnvInput
): Promise<void> {
  applyManagedAccountPtyEnv(env, input)
  const pinnedClaudeAccount = env[managedAccountEnvKey('claude')]
  if (pinnedClaudeAccount && env.CLAUDE_CONFIG_DIR) {
    await materializeClaudeManagedCredential(pinnedClaudeAccount, env.CLAUDE_CONFIG_DIR)
  }
}
