import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gitExecFileAsync, nonInteractiveGitEnv } from '../git/runner'
import { arcaGitignoreTemplate } from './project-seed-files'

const GIT_TIMEOUT_MS = 60_000
const PUSH_TIMEOUT_MS = 10 * 60_000

async function git(cwd: string, args: string[], timeout = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await gitExecFileAsync(args, { cwd, timeout, env: nonInteractiveGitEnv() })
  return stdout.trim()
}

export function resolvePublishRemoteName(
  remotes: { name: string; url: string }[],
  targetUrl: string,
  preferred?: string
): string {
  const matching = remotes.find((remote) => sameRepository(remote.url, targetUrl))
  if (matching) {
    return matching.name
  }
  if (preferred) {
    return preferred
  }
  // `origin` already points somewhere else: publish under `arca` instead of hijacking it.
  return remotes.some((remote) => remote.name === 'origin') ? 'arca' : 'origin'
}

function sameRepository(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value
      .trim()
      .replace(/^[^@/]+@([^:]+):/, '$1/')
      .replace(/^https?:\/\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  return normalize(left) === normalize(right)
}

export async function listGitRemotes(cwd: string): Promise<{ name: string; url: string }[]> {
  const output = await git(cwd, ['remote', '-v'])
  const remotes = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const [name, url] = line.trim().split(/\s+/)
    if (name && url && !remotes.has(name)) {
      remotes.set(name, url)
    }
  }
  return [...remotes].map(([name, url]) => ({ name, url }))
}

export async function isGitWorkingTree(cwd: string): Promise<boolean> {
  try {
    return (await git(cwd, ['rev-parse', '--is-inside-work-tree'])) === 'true'
  } catch {
    return false
  }
}

async function hasCommit(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

async function missing(target: string): Promise<boolean> {
  try {
    await stat(target)
    return false
  } catch {
    return true
  }
}

/**
 * Turns an arbitrary local folder into a repository pushed to ARCA. `git init` stays on the
 * 2.25 baseline (`-b` needs 2.28), so the default branch is set through symbolic-ref.
 */
export async function publishLocalFolder(input: {
  sourcePath: string
  url: string
  preferredRemoteName?: string
}): Promise<{ remoteName: string; branch: string; initialized: boolean }> {
  const initialized = !(await isGitWorkingTree(input.sourcePath))
  if (initialized) {
    await git(input.sourcePath, ['init'])
    await git(input.sourcePath, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  }
  if (await missing(path.join(input.sourcePath, '.gitignore'))) {
    await writeFile(path.join(input.sourcePath, '.gitignore'), arcaGitignoreTemplate(), 'utf8')
  }
  if (!(await hasCommit(input.sourcePath))) {
    await git(input.sourcePath, ['add', '-A'])
    await git(input.sourcePath, ['commit', '-m', 'Commit inicial'])
  }
  const remotes = await listGitRemotes(input.sourcePath)
  const remoteName = resolvePublishRemoteName(remotes, input.url, input.preferredRemoteName)
  const existing = remotes.find((remote) => remote.name === remoteName)
  if (!existing) {
    await git(input.sourcePath, ['remote', 'add', remoteName, input.url])
  } else if (!sameRepository(existing.url, input.url)) {
    throw new Error(`The remote "${remoteName}" already points to ${existing.url}.`)
  }
  const branch = (await git(input.sourcePath, ['branch', '--show-current'])) || 'main'
  await git(
    input.sourcePath,
    ['push', '-u', remoteName, `HEAD:refs/heads/${branch}`],
    PUSH_TIMEOUT_MS
  )
  return { remoteName, branch, initialized }
}

/** Optional and off by default: an open terminal keeps the old path alive. */
export async function moveProjectFolder(source: string, destination: string): Promise<void> {
  if (!(await missing(destination))) {
    throw new Error(`${destination} already exists.`)
  }
  await mkdir(path.dirname(destination), { recursive: true })
  await rename(source, destination)
}
