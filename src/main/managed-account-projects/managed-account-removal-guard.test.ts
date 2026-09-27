import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ManagedAccountProjectsService,
  setManagedAccountProjectsService
} from './managed-account-project-map'
import { assertManagedAccountRemovable } from './managed-account-removal-guard'
import { readPinnedCodexManagedAccountFromEnv } from './pinned-codex-launch-account'

const dirs: string[] = []

afterEach(() => {
  setManagedAccountProjectsService(null)
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function register(): ManagedAccountProjectsService {
  const userDataPath = mkdtempSync(join(tmpdir(), 'managed-removal-guard-'))
  dirs.push(userDataPath)
  const service = new ManagedAccountProjectsService({
    userDataPath,
    settings: { getSettings: () => ({ claudeManagedAccounts: [], codexManagedAccounts: [] }) }
  })
  setManagedAccountProjectsService(service)
  return service
}

it('blocks removing an account a project is pinned to', async () => {
  const service = register()
  await service.setProjectAccount('/tmp/repo', 'claude', 'claude-1')
  expect(() => assertManagedAccountRemovable('claude', 'claude-1', 'work@arca.com')).toThrowError(
    /fixed account/u
  )
  expect(() => assertManagedAccountRemovable('codex', 'claude-1')).not.toThrow()
})

it('blocks removing an account an open terminal is running on', () => {
  const service = register()
  service.recordSession({
    tabId: 'tab-1',
    agent: 'codex',
    accountId: 'codex-1',
    label: 'codex@arca.com'
  })
  expect(() => assertManagedAccountRemovable('codex', 'codex-1', 'codex@arca.com')).toThrowError(
    /open terminal/u
  )
  service.syncOpenTabs([])
  expect(() => assertManagedAccountRemovable('codex', 'codex-1')).not.toThrow()
})

it('does nothing in pi authority, where no managed map is registered', () => {
  expect(() => assertManagedAccountRemovable('claude', 'claude-1')).not.toThrow()
})

it('reads the Codex launch pin only for a host account that exists', () => {
  const host = {
    id: 'codex-1',
    email: 'codex@arca.com',
    managedHomePath: '/data/codex-accounts/codex-1/home',
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1
  }
  const wsl = { ...host, id: 'codex-wsl', managedHomeRuntime: 'wsl' as const }
  const accounts = [host, wsl]
  expect(
    readPinnedCodexManagedAccountFromEnv({ ARCA_MANAGED_ACCOUNT_CODEX: 'codex-1' }, accounts)
  ).toBe(host)
  expect(
    readPinnedCodexManagedAccountFromEnv({ ARCA_MANAGED_ACCOUNT_CODEX: 'codex-wsl' }, accounts)
  ).toBeNull()
  expect(
    readPinnedCodexManagedAccountFromEnv({ ARCA_MANAGED_ACCOUNT_CODEX: 'gone' }, accounts)
  ).toBeNull()
  expect(readPinnedCodexManagedAccountFromEnv(undefined, accounts)).toBeNull()
})
