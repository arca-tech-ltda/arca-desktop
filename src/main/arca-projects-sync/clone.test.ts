import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { gitExecFileAsync } from '../git/runner'
import type { ArcaCatalogEntry } from '../../shared/arca-projects-sync'
import {
  cloneArcaProject,
  clonePartialMarkerPath,
  inspectArcaCloneDestination,
  isCloneAccessError
} from './clone'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function createLocalRemote(root: string): Promise<string> {
  const source = path.join(root, 'source')
  const remote = path.join(root, 'remote.git')
  await mkdir(source, { recursive: true })
  await gitExecFileAsync(['init', '-q'], { cwd: source })
  await gitExecFileAsync(['config', 'user.email', 'test@example.com'], { cwd: source })
  await gitExecFileAsync(['config', 'user.name', 'Test'], { cwd: source })
  await writeFile(path.join(source, 'README.md'), 'ARCA')
  await gitExecFileAsync(['add', 'README.md'], { cwd: source })
  await gitExecFileAsync(['commit', '-qm', 'initial'], { cwd: source })
  await gitExecFileAsync(['init', '--bare', '-q', remote], { cwd: root })
  await gitExecFileAsync(['remote', 'add', 'origin', `file://${remote}`], { cwd: source })
  await gitExecFileAsync(['push', '-q', 'origin', 'HEAD:main'], { cwd: source })
  await gitExecFileAsync(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: remote })
  return `file://${remote}`
}

function makeEntry(url: string, destination: string): ArcaCatalogEntry {
  return {
    repoKey: 'github.com/arca-tech-ltda/local-test',
    name: 'local-test',
    url,
    destination,
    source: 'file'
  }
}

it('clones a file remote into the catalog destination', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'arca-sync-clone-'))
  temporaryDirectories.push(root)
  const remote = await createLocalRemote(root)
  const destination = path.join(root, 'ARCA', 'produtos', 'local-test')
  await cloneArcaProject(makeEntry(remote, destination))
  expect(await readFile(path.join(destination, 'README.md'), 'utf8')).toBe('ARCA')
  expect(await inspectArcaCloneDestination(destination, remote)).toBe('arca_repo')
})

it('rejects a non-empty destination with another repository', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'arca-sync-conflict-'))
  temporaryDirectories.push(root)
  const destination = path.join(root, 'ARCA', 'produtos', 'local-test')
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, 'notes.txt'), 'keep')
  await expect(
    cloneArcaProject(makeEntry('file:///tmp/not-the-same.git', destination))
  ).rejects.toThrow('different repository')
  expect(await readFile(path.join(destination, 'notes.txt'), 'utf8')).toBe('keep')
})

it('cleans an owned partial destination before retrying', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'arca-sync-partial-'))
  temporaryDirectories.push(root)
  const remote = await createLocalRemote(root)
  const destination = path.join(root, 'ARCA', 'produtos', 'local-test')
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, 'partial.txt'), 'incomplete')
  await writeFile(clonePartialMarkerPath(destination), '{"repoKey":"owned"}')
  await cloneArcaProject(makeEntry(remote, destination))
  expect(await readFile(path.join(destination, 'README.md'), 'utf8')).toBe('ARCA')
  await expect(readFile(clonePartialMarkerPath(destination))).rejects.toMatchObject({
    code: 'ENOENT'
  })
})

it.each([
  'Connection timed out',
  'Could not resolve hostname github.com',
  'Connection reset by peer'
])('does not apply a 24-hour access backoff after %s', (cause) => {
  expect(
    isCloneAccessError(new Error(`${cause}\nfatal: Could not read from remote repository.`))
  ).toBe(false)
  expect(isCloneAccessError(new Error('Authentication failed'))).toBe(true)
  expect(isCloneAccessError(new Error('fatal: Could not read from remote repository.'))).toBe(false)
})
