import {
  managedAccountEnvKey,
  managedAccountUnavailableMessage,
  type ManagedAccountAgent
} from '../../shared/managed-account-projects'
import type { CodexManagedAccount } from '../../shared/managed-account-types'

const CODEX_PIN_ENV_KEY = managedAccountEnvKey('codex' satisfies ManagedAccountAgent)

/**
 * The managed Codex account a PTY was launched for, carried in the app-private env the PTY layer
 * injected. Reading the pin from the env is what keeps every Codex home resolution on one answer:
 * launch preparation, the readiness gate and the pane registry all see the same launch env.
 */
export function readPinnedCodexManagedAccountFromEnv(
  launchEnv: NodeJS.ProcessEnv | undefined,
  accounts: readonly CodexManagedAccount[] | undefined
): CodexManagedAccount | null {
  const accountId = launchEnv?.[CODEX_PIN_ENV_KEY]?.trim()
  if (!accountId) {
    return null
  }
  const account = accounts?.find((entry) => entry.id === accountId)
  // WSL homes live inside the distro; a host launch must never be pinned to one.
  return account && account.managedHomeRuntime !== 'wsl' ? account : null
}

export function pinnedCodexAccountUnavailableMessage(label: string): string {
  return managedAccountUnavailableMessage('codex', label)
}
