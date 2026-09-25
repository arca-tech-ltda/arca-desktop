import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

// Same file, same rules as arca/extensions/lib/auth-lock.ts: Pi and the app share one bucket.
export const AUTH_LOCK_STALE_MS = 30_000
const retryMs = 50
const maxAttempts = 1_200

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

async function lockAgeMs(path: string): Promise<number | null> {
  try {
    return Date.now() - (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

/** Serializes read-modify-write of auth.json against Pi's own /accounts commands. */
export async function withAuthLock<T>(agentDir: string, run: () => Promise<T>): Promise<T> {
  const path = join(agentDir, 'auth.json.lock')
  await mkdir(agentDir, { recursive: true, mode: 0o700 })
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(path, JSON.stringify({ pid: process.pid, at: Date.now() }), {
        flag: 'wx',
        mode: 0o600
      })
      break
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') {
        throw error
      }
      if (attempt >= maxAttempts) {
        throw new Error('Pi auth.json.lock is held by another process')
      }
      const age = await lockAgeMs(path)
      if (age !== null && age < AUTH_LOCK_STALE_MS) {
        await sleep(retryMs)
        continue
      }
      // Stale or already gone: a crashed holder must not block credential writes forever.
      await unlink(path).catch(() => {})
    }
  }
  try {
    return await run()
  } finally {
    await unlink(path).catch(() => {})
  }
}
