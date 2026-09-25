import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { AUTH_LOCK_STALE_MS, withAuthLock } from './auth-lock'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function agentDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-auth-lock-'))
  dirs.push(dir)
  return dir
}

it('serializes holders and releases the lock file afterwards', async () => {
  const dir = await agentDir()
  const order: string[] = []
  const run = (name: string): Promise<void> =>
    withAuthLock(dir, async () => {
      order.push(`${name}:start`)
      await sleep(20)
      order.push(`${name}:end`)
    })
  await Promise.all([run('a'), run('b')])
  expect(order).toEqual(
    order[0] === 'a:start'
      ? ['a:start', 'a:end', 'b:start', 'b:end']
      : ['b:start', 'b:end', 'a:start', 'a:end']
  )
  expect(await readdir(dir)).toEqual([])
})

it('breaks a lock left behind more than thirty seconds ago', async () => {
  const dir = await agentDir()
  const lock = join(dir, 'auth.json.lock')
  await writeFile(lock, '{"pid":1}')
  const stale = new Date(Date.now() - AUTH_LOCK_STALE_MS - 1_000)
  await utimes(lock, stale, stale)
  await expect(withAuthLock(dir, async () => 'done')).resolves.toBe('done')
  expect(await readdir(dir)).toEqual([])
})
