import { mkdir, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { lock } from 'proper-lockfile'

// Same protocol as Pi's own AuthStorage (dist/core/auth-storage.js): proper-lockfile creates
// `<file>.lock` as a directory and refreshes its mtime, so a held lock never goes stale mid-write.
export const AUTH_LOCK_STALE_MS = 30_000
const ACQUIRE_DEADLINE_MS = 30_000
const MAX_RETRY_DELAY_MS = 2_000

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
}

/**
 * Older ARCA/Pi-extension builds locked with a `<file>.lock` FILE (`wx`). proper-lockfile then
 * fails with ENOTDIR forever, so an abandoned one past the stale window has to go.
 */
async function clearLegacyLockFile(path: string): Promise<void> {
  try {
    const entry = await stat(`${path}.lock`)
    if (!entry.isDirectory() && Date.now() - entry.mtimeMs >= AUTH_LOCK_STALE_MS) {
      await unlink(`${path}.lock`).catch(() => {})
    }
  } catch {
    // No lock at all is the common case.
  }
}

async function acquire(path: string): Promise<() => Promise<void>> {
  const deadline = Date.now() + ACQUIRE_DEADLINE_MS
  for (let retry = 0; ; retry++) {
    try {
      return await lock(path, {
        realpath: false,
        retries: 0,
        stale: AUTH_LOCK_STALE_MS,
        onCompromised: (error) =>
          console.warn(`[pi-accounts] Lock on ${path} was compromised`, error)
      })
    } catch (error) {
      const remainingMs = deadline - Date.now()
      if (errorCode(error) !== 'ELOCKED' || remainingMs <= 0) {
        throw error
      }
      const base = Math.min(10 * 2 ** retry, MAX_RETRY_DELAY_MS / 2)
      await sleep(Math.min(Math.round(base * (1 + Math.random())), remainingMs))
      await clearLegacyLockFile(path)
    }
  }
}

/** Serializes read-modify-write of a Pi credential file against Pi's own `/accounts` commands. */
export async function withPiFileLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await clearLegacyLockFile(path)
  const release = await acquire(path)
  try {
    return await run()
  } finally {
    await release().catch(() => {})
  }
}

export function withAuthLock<T>(agentDir: string, run: () => Promise<T>): Promise<T> {
  return withPiFileLock(join(agentDir, 'auth.json'), run)
}

export function withBucketLock<T>(agentDir: string, run: () => Promise<T>): Promise<T> {
  return withPiFileLock(join(agentDir, 'accounts.json'), run)
}

/** Contract order: accounts.json before auth.json, so no writer can deadlock against Pi. */
export function withBucketAndAuthLock<T>(agentDir: string, run: () => Promise<T>): Promise<T> {
  return withBucketLock(agentDir, () => withAuthLock(agentDir, run))
}
