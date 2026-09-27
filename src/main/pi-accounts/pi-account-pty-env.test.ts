import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PiAccountProjectsService } from './account-project-map'
import { applyPiAccountPtyEnv, buildPiAccountPtyEnv } from './pi-account-pty-env'
import { resetPiAccountSelectionSupportForTest } from './pi-account-selection-support'

const dirs: string[] = []
let service: PiAccountProjectsService

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-account-pty-env-'))
  dirs.push(dir)
  service = new PiAccountProjectsService({ agentDir: join(dir, 'agent') })
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '1')
  await service.setProjectAccount('/tmp/repo', 'anthropic', 'work')
  await service.setProjectAccount('/tmp/repo', 'openai-codex', 'codex-work')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  resetPiAccountSelectionSupportForTest()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

it('injects both providers for a mapped local project', () => {
  expect(buildPiAccountPtyEnv({ projectPath: '/tmp/repo', service })).toEqual({
    PI_ACCOUNT_ANTHROPIC: 'work',
    PI_ACCOUNT_OPENAI_CODEX: 'codex-work'
  })
})

it('never injects on SSH or WSL', () => {
  expect(
    buildPiAccountPtyEnv({ projectPath: '/tmp/repo', connectionId: 'ssh-1', service })
  ).toEqual({})
  expect(buildPiAccountPtyEnv({ projectPath: '/tmp/repo', isWsl: true, service })).toEqual({})
  expect(
    buildPiAccountPtyEnv({ projectPath: '\\\\wsl$\\Ubuntu\\home\\bi\\repo', service })
  ).toEqual({})
})

it('strips a PI_ACCOUNT_* already in the env of an SSH or WSL spawn', () => {
  for (const remote of [{ connectionId: 'ssh-1' }, { isWsl: true }]) {
    const env: Record<string, string> = {
      PI_ACCOUNT_ANTHROPIC: 'work',
      PI_ACCOUNT_OPENAI_CODEX: 'codex-work',
      PATH: '/usr/bin'
    }
    applyPiAccountPtyEnv(env, { projectPath: '/tmp/repo', ...remote, service })
    expect(env).toEqual({ PATH: '/usr/bin' })
  }
})

it('injects the mapped accounts into the env of a local spawn', () => {
  const env: Record<string, string> = { PATH: '/usr/bin' }
  applyPiAccountPtyEnv(env, { projectPath: '/tmp/repo', service })
  expect(env).toEqual({
    PATH: '/usr/bin',
    PI_ACCOUNT_ANTHROPIC: 'work',
    PI_ACCOUNT_OPENAI_CODEX: 'codex-work'
  })
})

it('injects nothing while the installed Pi has no support', () => {
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '')
  expect(buildPiAccountPtyEnv({ projectPath: '/tmp/repo', service })).toEqual({})
})

it('keeps an explicit per-session choice and still records it for the badge', () => {
  const env = buildPiAccountPtyEnv({
    projectPath: '/tmp/repo',
    tabId: 'tab-1',
    existingEnv: { PI_ACCOUNT_ANTHROPIC: 'personal' },
    service
  })
  expect(env.PI_ACCOUNT_ANTHROPIC).toBeUndefined()
  expect(env.PI_ACCOUNT_OPENAI_CODEX).toBe('codex-work')
  expect(service.getSessionsUsingAccount('anthropic', 'personal')).toHaveLength(1)
})

it('records the effective account of a mapped terminal', () => {
  buildPiAccountPtyEnv({ projectPath: '/tmp/repo', tabId: 'tab-2', worktreeId: 'w1', service })
  expect(service.getState().sessions).toEqual(
    expect.arrayContaining([
      { tabId: 'tab-2', provider: 'anthropic', name: 'work', worktreeId: 'w1' }
    ])
  )
})
