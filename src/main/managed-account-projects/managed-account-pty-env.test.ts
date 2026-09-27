import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentAuthorityMode } from '../../shared/agent-authority'
import { ManagedAccountProjectsService } from './managed-account-project-map'

let mode: AgentAuthorityMode = 'managed'
vi.mock('../agent-authority/agent-authority-state', () => ({
  getAgentAuthorityMode: () => mode
}))

const prepared: string[] = []
let configDir: string | null = null
vi.mock('./managed-account-homes', () => ({
  prepareClaudeManagedConfigDirForLaunch: (accountId: string) => {
    prepared.push(accountId)
    return configDir
  },
  materializeClaudeManagedCredential: async () => true
}))

const { applyManagedAccountPtyEnv, applyManagedAccountPtyEnvAsync, resolveManagedAccountPins } =
  await import('./managed-account-pty-env')

const dirs: string[] = []
let service: ManagedAccountProjectsService

beforeEach(async () => {
  mode = 'managed'
  prepared.length = 0
  const userDataPath = mkdtempSync(join(tmpdir(), 'managed-pty-env-'))
  dirs.push(userDataPath)
  configDir = join(userDataPath, 'claude-accounts', 'claude-1', 'auth')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, '.credentials.json'), '{}')
  service = new ManagedAccountProjectsService({
    userDataPath,
    settings: {
      getSettings: () => ({
        claudeManagedAccounts: [
          {
            id: 'claude-1',
            email: 'work@arca.com',
            managedAuthPath: configDir ?? '',
            authMethod: 'subscription-oauth',
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          }
        ],
        codexManagedAccounts: [
          {
            id: 'codex-1',
            email: 'codex@arca.com',
            managedHomePath: join(userDataPath, 'codex-accounts', 'codex-1', 'home'),
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          }
        ]
      })
    }
  })
  await service.setProjectAccount('/tmp/repo', 'claude', 'claude-1')
  await service.setProjectAccount('/tmp/repo', 'codex', 'codex-1')
})

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('injects the config dir for Claude and the account marker for Codex', () => {
  const env: Record<string, string> = { PATH: '/usr/bin' }
  applyManagedAccountPtyEnv(env, { projectPath: '/tmp/repo', service, tabId: 'tab-1' })
  expect(env).toEqual({
    PATH: '/usr/bin',
    ARCA_MANAGED_ACCOUNT_CLAUDE: 'claude-1',
    ARCA_MANAGED_ACCOUNT_CODEX: 'codex-1',
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: configDir
  })
  expect(service.getSessionsUsingAccount('claude', 'claude-1')).toHaveLength(1)
})

it('never injects on SSH or WSL, and strips a marker already in that env', () => {
  for (const remote of [{ connectionId: 'ssh-1' }, { isWsl: true }]) {
    const env: Record<string, string> = {
      ARCA_MANAGED_ACCOUNT_CLAUDE: 'claude-1',
      PATH: '/usr/bin'
    }
    applyManagedAccountPtyEnv(env, { projectPath: '/tmp/repo', ...remote, service })
    expect(env).toEqual({ PATH: '/usr/bin' })
  }
  const wslPathEnv: Record<string, string> = {}
  applyManagedAccountPtyEnv(wslPathEnv, {
    projectPath: '\\\\wsl$\\Ubuntu\\home\\bi\\repo',
    service
  })
  expect(wslPathEnv).toEqual({})
})

it('injects nothing in pi authority, so a project never pins CLAUDE_CONFIG_DIR there', () => {
  mode = 'pi'
  const env: Record<string, string> = { PATH: '/usr/bin' }
  applyManagedAccountPtyEnv(env, { projectPath: '/tmp/repo', service })
  expect(env).toEqual({ PATH: '/usr/bin' })
  expect(resolveManagedAccountPins({ projectPath: '/tmp/repo', service })).toEqual({})
})

it('lets an explicit per-terminal account win over the project mapping', async () => {
  await service.setProjectAccount('/tmp/repo', 'codex', 'codex-1')
  const env: Record<string, string> = { ARCA_MANAGED_ACCOUNT_CODEX: 'codex-other' }
  expect(
    resolveManagedAccountPins({ projectPath: '/tmp/repo', service, existingEnv: env })
  ).toMatchObject({ codex: 'codex-other' })
})

it('refuses the launch when the pinned account is gone instead of falling back', async () => {
  await service.setProjectAccount('/tmp/repo', 'claude', 'removed-account')
  expect(() => applyManagedAccountPtyEnv({}, { projectPath: '/tmp/repo', service })).toThrowError(
    /not available/u
  )
})

it('refuses the launch when the pinned Claude home cannot be prepared', () => {
  configDir = null
  expect(() => applyManagedAccountPtyEnv({}, { projectPath: '/tmp/repo', service })).toThrowError(
    /not available/u
  )
  expect(prepared).toEqual(['claude-1'])
})

it('resolves the pin from a worktree checked out inside the project', async () => {
  const env: Record<string, string> = {}
  await applyManagedAccountPtyEnvAsync(env, { cwd: '/tmp/repo/.worktrees/feature', service })
  expect(env.ARCA_MANAGED_ACCOUNT_CLAUDE).toBe('claude-1')
})
