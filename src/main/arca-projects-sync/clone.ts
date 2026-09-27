import { isTransientReviewHeadFetchError } from '../git/fetch-error-classification'
import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  gitExecFileAsync,
  gitSpawnAfterWindowsEnvironmentReady,
  nonInteractiveGitEnv
} from '../git/runner'
import { normalizeArcaRemote } from './catalog'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import type { ArcaCatalogEntry } from '../../shared/arca-projects-sync'

const PARTIAL_MARKER_SUFFIX = '.arca-sync-partial'
const CLONE_TIMEOUT_MS = 10 * 60_000

type DestinationState = 'missing' | 'empty' | 'arca_repo' | 'conflict'

export type CloneProgress = {
  phase: string
  percent: number
}

export function clonePartialMarkerPath(destination: string): string {
  return `${destination}${PARTIAL_MARKER_SUFFIX}`
}

function comparableRemote(value: string): string {
  return (
    normalizeArcaRemote(value) ??
    value
      .trim()
      .replace(/[\\/]+$/, '')
      .toLowerCase()
  )
}

function sameRemote(left: string, right: string): boolean {
  return comparableRemote(left) === comparableRemote(right)
}

export function isCloneAccessError(error: unknown): boolean {
  // SSH appends an access hint even when the connection itself failed.
  if (isTransientReviewHeadFetchError(error)) {
    return false
  }
  const message = String(error).toLowerCase()
  return (
    /\b(401|403)\b/.test(message) ||
    /repository not found|access denied|authentication failed|permission denied \(publickey\)/.test(
      message
    )
  )
}

async function removeWithRetries(target: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code !== 'EBUSY' && code !== 'EPERM') {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
  throw lastError
}

async function destinationState(
  destination: string,
  expectedRemote: string
): Promise<DestinationState> {
  const marker = clonePartialMarkerPath(destination)
  try {
    await lstat(marker)
    try {
      const remote = (
        await gitExecFileAsync(['config', '--get', 'remote.origin.url'], {
          cwd: destination,
          timeout: 10_000,
          env: nonInteractiveGitEnv()
        })
      ).stdout
      if (sameRemote(remote, expectedRemote)) {
        await removeWithRetries(marker)
        return 'arca_repo'
      }
    } catch {
      // The marker is ours; an interrupted clone without a usable origin is safe to remove.
    }
    await removeWithRetries(destination)
    await removeWithRetries(marker).catch(() => {})
    return 'missing'
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT') {
      throw error
    }
  }

  try {
    const info = await lstat(destination)
    if (!info.isDirectory()) {
      return 'conflict'
    }
    const entries = await readdir(destination)
    if (entries.length === 0) {
      return 'empty'
    }
    if (!entries.includes('.git')) {
      return 'conflict'
    }
    try {
      const remote = (
        await gitExecFileAsync(['config', '--get', 'remote.origin.url'], {
          cwd: destination,
          timeout: 10_000,
          env: nonInteractiveGitEnv()
        })
      ).stdout
      return sameRemote(remote, expectedRemote) ? 'arca_repo' : 'conflict'
    } catch {
      return 'conflict'
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') {
      return 'missing'
    }
    throw error
  }
}

function parseProgress(text: string, previous: number): CloneProgress {
  const matches = [
    ...text.matchAll(/(?:Receiving objects|Resolving deltas|Compressing objects):\s+(\d+)%/g)
  ]
  const percent = matches.reduce((highest, match) => Math.max(highest, Number(match[1])), previous)
  const phase =
    text.match(/(?:Receiving objects|Resolving deltas|Compressing objects):/)?.[0]?.slice(0, -1) ??
    'Cloning'
  return { phase, percent }
}

export async function cloneArcaProject(
  entry: ArcaCatalogEntry,
  onProgress: (progress: CloneProgress) => void = () => {}
): Promise<void> {
  const paths = isWindowsAbsolutePathLike(entry.destination) ? path.win32 : path
  const parent = paths.dirname(entry.destination)
  await mkdir(parent, { recursive: true })
  const marker = clonePartialMarkerPath(entry.destination)
  const state = await destinationState(entry.destination, entry.url)
  if (state === 'arca_repo') {
    return
  }
  if (state === 'conflict') {
    throw new Error('The catalog destination contains a different repository.')
  }
  await writeFile(marker, JSON.stringify({ repoKey: entry.repoKey }), 'utf8')
  let process: Awaited<ReturnType<typeof gitSpawnAfterWindowsEnvironmentReady>>
  try {
    process = await gitSpawnAfterWindowsEnvironmentReady(
      ['clone', '--progress', '--', entry.url, entry.destination],
      {
        cwd: parent,
        admissionTier: 'background',
        env: nonInteractiveGitEnv(),
        stdio: ['ignore', 'ignore', 'pipe']
      }
    )
  } catch (error) {
    await removeWithRetries(entry.destination).catch(() => {})
    await removeWithRetries(marker).catch(() => {})
    throw error
  }

  await new Promise<void>((resolve, reject) => {
    let output = ''
    let percent = 0
    let settled = false
    const timer = setTimeout(() => {
      process.kill()
      reject(new Error('Clone timed out'))
    }, CLONE_TIMEOUT_MS)
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    process.stderr?.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4096)
      const progress = parseProgress(output, percent)
      percent = progress.percent
      onProgress(progress)
    })
    process.once('error', (error) => finish(error))
    process.once('close', (code, signal) => {
      if (code === 0 && signal === null) {
        finish()
      } else {
        finish(new Error(`Clone failed: ${output.trim() || String(code ?? signal ?? 'unknown')}`))
      }
    })
  }).catch(async (error) => {
    await removeWithRetries(entry.destination).catch(() => {})
    throw error
  })
  await removeWithRetries(marker)
}

export async function inspectArcaCloneDestination(
  destination: string,
  expectedRemote: string
): Promise<'missing' | 'arca_repo' | 'conflict'> {
  const state = await destinationState(destination, expectedRemote)
  return state === 'empty' ? 'missing' : state
}
