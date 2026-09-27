import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'claude-managed-removal-'))

vi.mock('electron', () => ({ app: { getPath: () => userData } }))
vi.mock('./keychain', () => ({
  deleteManagedClaudeKeychainCredentials: vi.fn(async () => {}),
  readManagedClaudeKeychainCredentials: vi.fn(async () => null),
  writeManagedClaudeKeychainCredentials: vi.fn(async () => {})
}))

const { ClaudeManagedAuthStorage } = await import('./claude-managed-auth-storage')
const { linkAgentHomeResource } =
  await import('../managed-account-projects/agent-home-resource-link')

afterEach(() => {
  rmSync(join(userData, 'claude-accounts'), { recursive: true, force: true })
})

it('removes the account home without deleting what its links point at', async () => {
  const realHome = mkdtempSync(join(tmpdir(), 'claude-real-home-'))
  mkdirSync(join(realHome, 'skills', 'arca-megamind'), { recursive: true })
  writeFileSync(join(realHome, 'skills', 'arca-megamind', 'SKILL.md'), '# do usuário\n')

  const storage = new ClaudeManagedAuthStorage()
  const location = await storage.create('conta-1')
  linkAgentHomeResource(join(realHome, 'skills'), join(location.managedAuthPath, 'skills'))

  await storage.remove('conta-1', location.managedAuthPath)

  expect(existsSync(join(userData, 'claude-accounts', 'conta-1'))).toBe(false)
  expect(readFileSync(join(realHome, 'skills', 'arca-megamind', 'SKILL.md'), 'utf-8')).toBe(
    '# do usuário\n'
  )
  rmSync(realHome, { recursive: true, force: true })
})
