import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PiAccountProjectsService } from './account-project-map'
import {
  normalizeProjectPathKey,
  resolvePiAccountSelectionForLaunch
} from '../../shared/pi-account-projects'
import { resetPiAccountSelectionSupportForTest } from './pi-account-selection-support'

const dirs: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  resetPiAccountSelectionSupportForTest()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function service() {
  const dir = await mkdtemp(join(tmpdir(), 'pi-account-projects-'))
  dirs.push(dir)
  const agentDir = join(dir, 'agent')
  await mkdir(agentDir, { recursive: true })
  return {
    agentDir,
    instance: new PiAccountProjectsService({ agentDir }),
    file: async () => JSON.parse(await readFile(join(agentDir, 'account-projects.json'), 'utf8'))
  }
}

it('writes the contract shape and normalizes the project path', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/repo/', 'anthropic', 'work')
  expect(await f.file()).toEqual({ version: 1, projects: { '/tmp/repo': { anthropic: 'work' } } })
  await f.instance.setProjectAccount('/tmp/repo', 'anthropic', null)
  expect(await f.file()).toEqual({ version: 1, projects: {} })
})

it('folds Windows case and separators onto one key', () => {
  expect(normalizeProjectPathKey('C:/ARCA/Repo\\', 'win32')).toBe('c:\\arca\\repo')
  expect(normalizeProjectPathKey('/Users/Bi/Repo/', 'darwin')).toBe('/Users/Bi/Repo')
})

it('keeps the map usable when the file is corrupt', async () => {
  const f = await service()
  await writeFile(join(f.agentDir, 'account-projects.json'), 'not json')
  await f.instance.load()
  expect(f.instance.getMap().projects).toEqual({})
})

it('re-reads inside the lock so a concurrent writer is not lost', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/a', 'anthropic', 'work')
  const other = new PiAccountProjectsService({ agentDir: f.agentDir })
  await other.setProjectAccount('/tmp/b', 'openai-codex', 'personal')
  await f.instance.setProjectAccount('/tmp/c', 'anthropic', 'client')
  expect((await f.file()).projects).toEqual({
    '/tmp/a': { anthropic: 'work' },
    '/tmp/b': { 'openai-codex': 'personal' },
    '/tmp/c': { anthropic: 'client' }
  })
})

it('rename follows the mapping and remove guards report the users', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/repo', 'anthropic', 'work')
  await f.instance.renameAccount('anthropic', 'work', 'work-2')
  expect(f.instance.getProjectsUsingAccount('anthropic', 'work-2')).toEqual(['/tmp/repo'])
  f.instance.recordSession({ tabId: 'tab-1', provider: 'anthropic', name: 'work-2' })
  expect(f.instance.getSessionsUsingAccount('anthropic', 'work-2')).toHaveLength(1)
  f.instance.syncOpenTabs([])
  expect(f.instance.getSessionsUsingAccount('anthropic', 'work-2')).toHaveLength(0)
})

it('resolves a worktree checked out inside a mapped project by longest prefix', () => {
  const map = {
    version: 1 as const,
    projects: {
      '/tmp/repo': { anthropic: 'work' },
      '/tmp/repo/nested': { anthropic: 'nested' }
    }
  }
  expect(
    resolvePiAccountSelectionForLaunch(map, { cwd: '/tmp/repo/nested/src' }, 'darwin')
  ).toEqual({ anthropic: 'nested' })
  expect(resolvePiAccountSelectionForLaunch(map, { cwd: '/tmp/repository' }, 'darwin')).toEqual({})
})

it('injects nothing until the installed Pi declares support', async () => {
  const f = await service()
  await f.instance.setProjectAccount('/tmp/repo', 'anthropic', 'work')
  expect(f.instance.resolveSelection({ projectPath: '/tmp/repo' })).toEqual({})
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '1')
  expect(f.instance.resolveSelection({ projectPath: '/tmp/repo' })).toEqual({ anthropic: 'work' })
})
