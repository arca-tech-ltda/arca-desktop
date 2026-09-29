import { beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ git: vi.fn() }))
vi.mock('../git/runner', () => ({
  gitExecFileAsync: mocks.git,
  nonInteractiveGitEnv: () => ({})
}))
import { publishLocalFolder, resolvePublishRemoteName } from './local-publish'

const runs: string[] = []

function gitCalls(): string[] {
  return runs
}

function respond(responses: Record<string, string>, failing: string[] = []): void {
  mocks.git.mockImplementation(async (args: string[]) => {
    const key = args.join(' ')
    runs.push(key)
    if (failing.includes(key)) {
      throw new Error(`git ${key} failed`)
    }
    return { stdout: responses[key] ?? '', stderr: '' }
  })
}

let folder = ''
beforeEach(async () => {
  vi.resetAllMocks()
  runs.length = 0
  folder = await mkdtemp(path.join(tmpdir(), 'arca-publish-'))
})

it('initializes a plain folder on the Git 2.25 baseline and pushes it', async () => {
  respond({ 'branch --show-current': 'main' }, ['rev-parse --verify HEAD'])
  const result = await publishLocalFolder({
    sourcePath: folder,
    url: 'https://github.com/arca-tech-ltda/estudos.git'
  })
  expect(gitCalls()).toEqual([
    'rev-parse --is-inside-work-tree',
    'init',
    'symbolic-ref HEAD refs/heads/main',
    'rev-parse --verify HEAD',
    'add -A',
    'commit -m Commit inicial',
    'remote -v',
    'remote add origin https://github.com/arca-tech-ltda/estudos.git',
    'branch --show-current',
    'push -u origin HEAD:refs/heads/main'
  ])
  expect(result).toEqual({ remoteName: 'origin', branch: 'main', initialized: true })
  expect(await readFile(path.join(folder, '.gitignore'), 'utf8')).toContain('node_modules/')
})

it('keeps an existing .gitignore and an existing history', async () => {
  await writeFile(path.join(folder, '.gitignore'), 'meu-proprio\n', 'utf8')
  respond({
    'rev-parse --is-inside-work-tree': 'true',
    'rev-parse --verify HEAD': 'abc123',
    'branch --show-current': 'trunk'
  })
  await publishLocalFolder({
    sourcePath: folder,
    url: 'https://github.com/arca-tech-ltda/estudos.git'
  })
  expect(gitCalls()).not.toContain('init')
  expect(gitCalls()).not.toContain('add -A')
  expect(gitCalls()).toContain('push -u origin HEAD:refs/heads/trunk')
  expect(await readFile(path.join(folder, '.gitignore'), 'utf8')).toBe('meu-proprio\n')
})

it('adds the ARCA remote as "arca" when origin points somewhere else', async () => {
  respond({
    'rev-parse --is-inside-work-tree': 'true',
    'rev-parse --verify HEAD': 'abc123',
    'remote -v':
      'origin git@github.com:ana/estudos.git (fetch)\norigin git@github.com:ana/estudos.git (push)',
    'branch --show-current': 'main'
  })
  const result = await publishLocalFolder({
    sourcePath: folder,
    url: 'https://github.com/arca-tech-ltda/estudos.git'
  })
  expect(result.remoteName).toBe('arca')
  expect(gitCalls()).toContain('remote add arca https://github.com/arca-tech-ltda/estudos.git')
})

it('reuses the remote that already points at the ARCA repository', () => {
  expect(
    resolvePublishRemoteName(
      [{ name: 'upstream', url: 'git@github.com:arca-tech-ltda/estudos.git' }],
      'https://github.com/arca-tech-ltda/estudos.git'
    )
  ).toBe('upstream')
})

it('refuses to repoint a remote that belongs to another repository', async () => {
  respond({
    'rev-parse --is-inside-work-tree': 'true',
    'rev-parse --verify HEAD': 'abc123',
    'remote -v': 'arca git@github.com:ana/outro.git (fetch)',
    'branch --show-current': 'main'
  })
  await expect(
    publishLocalFolder({
      sourcePath: folder,
      url: 'https://github.com/arca-tech-ltda/estudos.git',
      preferredRemoteName: 'arca'
    })
  ).rejects.toThrow(/already points to/)
})
