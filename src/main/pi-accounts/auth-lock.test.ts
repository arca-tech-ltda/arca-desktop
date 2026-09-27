import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { lock } from 'proper-lockfile'
import {
  AUTH_LOCK_STALE_MS,
  withAuthLock,
  withBucketAndAuthLock,
  withBucketLock
} from './auth-lock'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function agentDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-auth-lock-'))
  dirs.push(dir)
  return dir
}

it('serializes holders and releases the lock directory afterwards', async () => {
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

it('uses the proper-lockfile protocol Pi holds: a directory next to the file', async () => {
  const dir = await agentDir()
  let seenDirectory: boolean | null = null
  await withAuthLock(dir, async () => {
    seenDirectory = (await stat(join(dir, 'auth.json.lock'))).isDirectory()
  })
  expect(seenDirectory).toBe(true)
})

it('blocks while Pi itself holds the same lock, then runs', async () => {
  const dir = await agentDir()
  await writeFile(join(dir, 'accounts.json'), '{}')
  const release = await lock(join(dir, 'accounts.json'), {
    realpath: false,
    retries: 0,
    stale: AUTH_LOCK_STALE_MS
  })
  let entered = false
  const pending = withBucketLock(dir, async () => {
    entered = true
  })
  await sleep(30)
  expect(entered).toBe(false)
  await release()
  await pending
  expect(entered).toBe(true)
})

it('breaks a lock left behind more than the stale window ago', async () => {
  const dir = await agentDir()
  const held = await lock(join(dir, 'auth.json'), {
    realpath: false,
    retries: 0,
    stale: AUTH_LOCK_STALE_MS,
    update: 1_000_000
  })
  const stale = new Date(Date.now() - AUTH_LOCK_STALE_MS - 5_000)
  await utimes(join(dir, 'auth.json.lock'), stale, stale)
  await expect(withAuthLock(dir, async () => 'done')).resolves.toBe('done')
  await held().catch(() => {})
})

it('takes accounts.json before auth.json so writers cannot deadlock against each other', async () => {
  const dir = await agentDir()
  await withBucketAndAuthLock(dir, async () => {
    expect((await stat(join(dir, 'accounts.json.lock'))).isDirectory()).toBe(true)
    expect((await stat(join(dir, 'auth.json.lock'))).isDirectory()).toBe(true)
  })
  expect(await readdir(dir)).toEqual([])
})
