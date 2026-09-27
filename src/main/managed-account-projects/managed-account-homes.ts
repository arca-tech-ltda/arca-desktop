import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
import type { ManagedAccountSettingsSnapshot } from './managed-account-project-map'

type ManagedAccountSettingsReader = () => ManagedAccountSettingsSnapshot

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
  if (!configDir || !hasClaudeManagedCredential(configDir)) {
    return null
  }
  syncClaudeManagedHomeResources({
    configDir,
    hooksEnabled: isAgentStatusHooksEnabled(readSettings?.())
  })
  return configDir
}

/** Zero-secret stamp: on macOS it records that the config dir's Keychain item was seeded. */
const KEYCHAIN_CREDENTIAL_STAMP = '.orca-managed-claude-keychain'

/** Launch gate, synchronous by necessity: the Keychain cannot be read without awaiting. */
export function hasClaudeManagedCredential(configDir: string): boolean {
  return (
    existsSync(join(configDir, '.credentials.json')) ||
    (process.platform === 'darwin' && existsSync(join(configDir, KEYCHAIN_CREDENTIAL_STAMP)))
  )
}

/**
 * The credential has to be reachable from the pinned config dir itself.
 *
 * On macOS that place is the Keychain item Claude scopes by config dir — never the default one,
 * which belongs to whatever account is globally selected. That item is also the **only** copy ARCA
 * keeps for a pinned launch: writing `.credentials.json` next to it would put a token on disk in
 * the clear and, worse, leave a second copy that Claude's next in-place refresh does not update.
 * An existing item is never overwritten, so a refreshed token is never rolled back.
 *
 * Runs when a pin is saved and again before an IPC-spawned terminal starts.
 */
export async function materializeClaudeManagedCredential(
  accountId: string,
  configDir = resolveClaudeManagedConfigDir(accountId)
): Promise<boolean> {
  if (!configDir) {
    return false
  }
  if (process.platform !== 'darwin') {
    const credentials =
      readClaudeManagedAuthFile(configDir, '.credentials.json') ??
      (await readManagedClaudeKeychainCredentials(accountId))
    if (!credentials) {
      return false
    }
    writeClaudeManagedAuthFile(configDir, '.credentials.json', credentials)
    return true
  }
  if (await readActiveClaudeKeychainCredentialsStrict(configDir)) {
    stampKeychainCredential(configDir)
    return true
  }
  // Only as a seed: a home from an older build may still hold the cleartext copy.
  const seed =
    (await readManagedClaudeKeychainCredentials(accountId)) ??
    readClaudeManagedAuthFile(configDir, '.credentials.json')
  if (!seed) {
    return false
  }
  await writeActiveClaudeKeychainCredentials(seed, configDir)
  stampKeychainCredential(configDir)
  return true
}

function stampKeychainCredential(configDir: string): void {
  try {
    writeFileSync(join(configDir, KEYCHAIN_CREDENTIAL_STAMP), 'keychain\n', {
      encoding: 'utf-8',
      mode: 0o600
    })
  } catch {
    /* The stamp only spares a re-seed; the launch gate still accepts a legacy cleartext copy. */
  }
}
