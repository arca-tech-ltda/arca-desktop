import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  normalizeProjectPathKey,
  resolveProjectSelectionForLaunch
} from '../../shared/project-account-paths'
import { resolveManagedAccountSelectionForLaunch } from '../../shared/managed-account-projects'
import { ManagedAccountProjectsService } from './managed-account-project-map'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const accounts = {
  claudeManagedAccounts: [
    {
      id: 'claude-1',
      email: 'work@arca.com',
      managedAuthPath: '/data/claude-accounts/claude-1/auth',
      authMethod: 'subscription-oauth' as const,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    },
    {
      id: 'claude-wsl',
      email: 'wsl@arca.com',
      managedAuthPath: '\\\\wsl.localhost\\Ubuntu\\home\\bi\\auth',
      managedAuthRuntime: 'wsl' as const,
      authMethod: 'subscription-oauth' as const,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  ],
  codexManagedAccounts: [
    {
      id: 'codex-1',
      email: 'codex@arca.com',
      managedHomePath: '/data/codex-accounts/codex-1/home',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  ]
}

async function service(): Promise<{
  instance: ManagedAccountProjectsService
  userDataPath: string
  file: () => Promise<unknown>
}> {
  const userDataPath = await mkdtemp(join(tmpdir(), 'managed-account-projects-'))
  dirs.push(userDataPath)
  return {
    userDataPath,
    instance: new ManagedAccountProjectsService({
      userDataPath,
      settings: { getSettings: () => accounts }
    }),
    file: async () =>
      JSON.parse(await readFile(join(userDataPath, 'managed-account-projects.json'), 'utf-8'))
  }
}

it('writes account ids and normalizes the project path', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/repo/', 'claude', 'claude-1')
  expect(await f.file()).toEqual({ version: 1, projects: { '/tmp/repo': { claude: 'claude-1' } } })
  await f.instance.setProjectAccount('/tmp/repo', 'claude', null)
  expect(await f.file()).toEqual({ version: 1, projects: {} })
})

it('folds Windows case and separators onto one key', () => {
  expect(normalizeProjectPathKey('C:/ARCA/Repo\\', 'win32')).toBe('c:\\arca\\repo')
  expect(normalizeProjectPathKey('C:\\', 'win32')).toBe('c:\\')
  expect(normalizeProjectPathKey('/ARCA/Repo/', 'darwin')).toBe('/ARCA/Repo')
})

it('resolves a Windows worktree inside a mapped project, case-insensitively', () => {
  const map = {
    version: 1 as const,
    projects: { 'c:\\arca\\repo': { claude: 'claude-1' }, 'c:\\arca': { codex: 'codex-1' } }
  }
  expect(
    resolveManagedAccountSelectionForLaunch(
      map,
      { cwd: 'C:\\ARCA\\Repo\\.worktrees\\feature' },
      'win32'
    )
  ).toEqual({ claude: 'claude-1' })
  expect(resolveProjectSelectionForLaunch(map.projects, { cwd: 'C:\\Other' }, 'win32')).toBeNull()
})

it('keeps only host accounts as pinnable options', async () => {
  const f = await service()
  expect(f.instance.listAccounts()).toEqual([
    { agent: 'claude', id: 'claude-1', label: 'work@arca.com' },
    { agent: 'codex', id: 'codex-1', label: 'codex@arca.com' }
  ])
  expect(f.instance.hasAccount('claude', 'claude-wsl')).toBe(false)
})

it('re-reads the file inside each write so a second window does not lose its entry', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/a', 'claude', 'claude-1')
  await writeFile(
    join(f.userDataPath, 'managed-account-projects.json'),
    JSON.stringify({ version: 1, projects: { '/tmp/b': { codex: 'codex-1' } } })
  )
  await f.instance.setProjectAccount('/tmp/a', 'claude', 'claude-1')
  await f.instance.setProjectAccount('/tmp/c', 'codex', 'codex-1')
  expect(await f.file()).toEqual({
    version: 1,
    projects: { '/tmp/b': { codex: 'codex-1' }, '/tmp/a': { claude: 'claude-1' }, '/tmp/c': { codex: 'codex-1' } }
  })
})

it('reports projects and open terminals using an account, and forgets it on removal', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/repo', 'claude', 'claude-1')
  f.instance.recordSession({
    tabId: 'tab-1',
    agent: 'claude',
    accountId: 'claude-1',
    label: 'work@arca.com'
  })
  expect(f.instance.getProjectsUsingAccount('claude', 'claude-1')).toEqual(['/tmp/repo'])
  expect(f.instance.getSessionsUsingAccount('claude', 'claude-1')).toHaveLength(1)
  f.instance.syncOpenTabs([])
  expect(f.instance.getSessionsUsingAccount('claude', 'claude-1')).toHaveLength(0)
  await f.instance.forgetAccount('claude', 'claude-1')
  expect(await f.file()).toEqual({ version: 1, projects: {} })
})

it('ignores a corrupt or unknown-version file instead of throwing', async () => {
  const f = await service()
  await writeFile(join(f.userDataPath, 'managed-account-projects.json'), '{ not json')
  expect(f.instance.load().projects).toEqual({})
  await writeFile(
    join(f.userDataPath, 'managed-account-projects.json'),
    JSON.stringify({ version: 2, projects: { '/tmp/a': { claude: 'claude-1' } } })
  )
  expect(f.instance.load().projects).toEqual({})
})
