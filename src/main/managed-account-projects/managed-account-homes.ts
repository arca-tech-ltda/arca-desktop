import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { ClaudeManagedAccount, CodexManagedAccount } from '../../shared/managed-account-types'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import {
  readActiveClaudeKeychainCredentialsStrict,
  readManagedClaudeKeychainCredentials,
  writeActiveClaudeKeychainCredentials
} from '../claude-accounts/keychain'
import {
  readClaudeManagedAuthFile,
  resolveOwnedClaudeManagedAuthPath,
  writeClaudeManagedAuthFile
} from '../claude-accounts/managed-auth-path'
import { syncClaudeManagedHomeResources } from './claude-managed-home-resources'

type ManagedAccountSettingsReader = () => Pick<
  GlobalSettings,
  'claudeManagedAccounts' | 'codexManagedAccounts'
> &
  Partial<GlobalSettings>

let readSettings: ManagedAccountSettingsReader | null = null

export function setManagedAccountSettingsReader(reader: ManagedAccountSettingsReader | null): void {
  readSettings = reader
}

export function findClaudeManagedAccount(accountId: string): ClaudeManagedAccount | null {
  const account = readSettings?.().claudeManagedAccounts?.find((entry) => entry.id === accountId)
  // WSL accounts keep credentials inside the distro; per-project pinning is host-only.
  return account && account.managedAuthRuntime !== 'wsl' ? account : null
}

export function findCodexManagedAccount(accountId: string): CodexManagedAccount | null {
  const account = readSettings?.().codexManagedAccounts?.find((entry) => entry.id === accountId)
  return account && account.managedHomeRuntime !== 'wsl' ? account : null
}

/** The account's own `CLAUDE_CONFIG_DIR`, only when ARCA can still prove it owns that directory. */
export function resolveClaudeManagedConfigDir(accountId: string): string | null {
  const account = findClaudeManagedAccount(accountId)
  if (!account) {
    return null
  }
  return resolveOwnedClaudeManagedAuthPath(account.id, account.managedAuthPath)
}

/**
 * Prepares the pinned Claude account's home for a launch: hooks, MCP and skills mirrored in.
 * Returns null when the account cannot be used, so the caller fails the launch with a clear
 * message instead of starting on someone else's account.
 */
export function prepareClaudeManagedConfigDirForLaunch(accountId: string): string | null {
  const configDir = resolveClaudeManagedConfigDir(accountId)
  if (!configDir || !existsSync(join(configDir, '.credentials.json'))) {
    return null
  }
  syncClaudeManagedHomeResources({
    configDir,
    hooksEnabled: isAgentStatusHooksEnabled(readSettings?.() as GlobalSettings | undefined)
  })
  return configDir
}

/**
 * The credential has to be reachable from the pinned config dir itself. On macOS Claude scopes its
 * Keychain item by config dir, so seed that item — never the default one, which belongs to whatever
 * account is globally selected — and only when it is missing, so a token Claude refreshed in place
 * is never rolled back. Runs when a pin is saved and again before an IPC-spawned terminal starts.
 */
export async function materializeClaudeManagedCredential(
  accountId: string,
  configDir = resolveClaudeManagedConfigDir(accountId)
): Promise<boolean> {
  if (!configDir) {
    return false
  }
  let credentials = readClaudeManagedAuthFile(configDir, '.credentials.json')
  if (!credentials) {
    credentials = await readManagedClaudeKeychainCredentials(accountId)
    if (credentials) {
      writeClaudeManagedAuthFile(configDir, '.credentials.json', credentials)
    }
  }
  if (!credentials) {
    return false
  }
  if (
    process.platform === 'darwin' &&
    !(await readActiveClaudeKeychainCredentialsStrict(configDir))
  ) {
    await writeActiveClaudeKeychainCredentials(credentials, configDir)
  }
  return true
}
