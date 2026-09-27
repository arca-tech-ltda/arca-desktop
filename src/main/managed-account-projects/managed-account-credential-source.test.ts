import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const keychain = vi.hoisted(() => ({
  /** Claude's own item, scoped by config dir — the place Claude refreshes in place. */
  byConfigDir: new Map<string, string>(),
  /** ARCA's per-account backup, used only to seed the one above. */
  byAccount: new Map<string, string>()
}))

vi.mock('../claude-accounts/keychain', () => ({
  readActiveClaudeKeychainCredentialsStrict: vi.fn(
    async (configDir: string) => keychain.byConfigDir.get(configDir) ?? null
  ),
  writeActiveClaudeKeychainCredentials: vi.fn(async (contents: string, configDir: string) => {
    keychain.byConfigDir.set(configDir, contents)
  }),
  readManagedClaudeKeychainCredentials: vi.fn(
    async (accountId: string) => keychain.byAccount.get(accountId) ?? null
  )
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const dirs: string[] = []

const { hasClaudeManagedCredential, materializeClaudeManagedCredential } =
  await import('./managed-account-homes')

function configDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'claude-managed-cred-'))
  dirs.push(dir)
  mkdirSync(dir, { recursive: true })
  return dir
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  keychain.byConfigDir.clear()
  keychain.byAccount.clear()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('keeps one credential source on macOS: the Keychain item of the config dir', async () => {
  const dir = configDir()
  keychain.byAccount.set('conta-1', '{"accessToken":"t1"}')

  await expect(materializeClaudeManagedCredential('conta-1', dir)).resolves.toBe(true)

  expect(keychain.byConfigDir.get(dir)).toBe('{"accessToken":"t1"}')
  // No cleartext token on disk, and no second copy to go stale on the next refresh.
  expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
  expect(hasClaudeManagedCredential(dir)).toBe(true)
})

it('never rolls back a token Claude refreshed in its own item', async () => {
  const dir = configDir()
  keychain.byAccount.set('conta-1', '{"accessToken":"antigo"}')
  keychain.byConfigDir.set(dir, '{"accessToken":"rotacionado"}')

  await materializeClaudeManagedCredential('conta-1', dir)

  expect(keychain.byConfigDir.get(dir)).toBe('{"accessToken":"rotacionado"}')
  expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
})

it('seeds the item from a legacy cleartext copy and stops relying on it', async () => {
  const dir = configDir()
  writeFileSync(join(dir, '.orca-managed-claude-auth'), 'conta-1\n')
  writeFileSync(join(dir, '.credentials.json'), '{"accessToken":"legado"}', { mode: 0o600 })

  await expect(materializeClaudeManagedCredential('conta-1', dir)).resolves.toBe(true)

  expect(keychain.byConfigDir.get(dir)).toBe('{"accessToken":"legado"}')
})

it('reports no credential when neither store has one', async () => {
  const dir = configDir()
  await expect(materializeClaudeManagedCredential('conta-1', dir)).resolves.toBe(false)
  expect(hasClaudeManagedCredential(dir)).toBe(false)
})
