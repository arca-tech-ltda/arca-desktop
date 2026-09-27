import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createCachedWorkspaceFactsReader,
  resolveHeadFilePath,
  type MegamindWorkspaceFacts
} from './agent-session-project'

const roots: string[] = []

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'arca-megamind-facts-'))
  roots.push(root)
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function facts(root: string, branch: string): MegamindWorkspaceFacts {
  return { root, repoKey: 'github.com/arca-tech/infra', branch }
}

it('finds HEAD in a plain repo and through a worktree .git file', () => {
  const root = repo()
  expect(resolveHeadFilePath(root)).toBe(join(root, '.git', 'HEAD'))

  const worktree = mkdtempSync(join(tmpdir(), 'arca-megamind-wt-'))
  roots.push(worktree)
  writeFileSync(join(worktree, '.git'), `gitdir: ${join(root, '.git', 'worktrees', 'a')}\n`)
  expect(resolveHeadFilePath(worktree)).toBe(join(root, '.git', 'worktrees', 'a', 'HEAD'))

  const folder = mkdtempSync(join(tmpdir(), 'arca-megamind-folder-'))
  roots.push(folder)
  expect(resolveHeadFilePath(folder)).toBeNull()
})

it('spawns git once per cwd until HEAD is rewritten', async () => {
  const root = repo()
  const read = vi.fn(async (cwd: string) => facts(cwd, 'main'))
  const cached = createCachedWorkspaceFactsReader(read)

  await cached(root)
  await cached(root)
  expect(read).toHaveBeenCalledTimes(1)

  // A branch switch rewrites .git/HEAD: the next prompt must not report the old branch.
  read.mockImplementation(async (cwd: string) => facts(cwd, 'feat/b'))
  await new Promise((done) => setTimeout(done, 10))
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/feat/b\n')
  await expect(cached(root)).resolves.toMatchObject({ branch: 'feat/b' })
  expect(read).toHaveBeenCalledTimes(2)
})

it('never caches a workspace with no readable HEAD', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'arca-megamind-plain-'))
  roots.push(folder)
  const read = vi.fn(async (cwd: string) => ({ root: cwd, repoKey: null, branch: null }))
  const cached = createCachedWorkspaceFactsReader(read)

  await cached(folder)
  await cached(folder)
  expect(read).toHaveBeenCalledTimes(2)
})
