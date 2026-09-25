import { afterEach, expect, it, vi } from 'vitest'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PiAccountsService } from './service'
import { createAccountMirror } from './mirror'
import { authSchema, bucketSchema, readJson, writeJson } from './files'
import type { PiAccountsState } from '../../shared/pi-accounts'

const homes: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'pi-accounts-contract-'))
  homes.push(home)
  const agentDir = join(home, 'agent')
  await cp(join(import.meta.dirname, 'fixtures'), agentDir, { recursive: true })
  await cp(join(agentDir, 'bucket.json'), join(agentDir, 'accounts.json'))
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir)
  vi.stubEnv('PI_ACCOUNTS_MIRROR', '1')
  const security = vi.fn(async (): Promise<{ code: number; stdout: string }> => {
    throw new Error('Unexpected Keychain access')
  })
  const mirror = createAccountMirror({ home, platform: 'win32', security })
  return {
    home,
    agentDir,
    security,
    service: new PiAccountsService({ mirror }),
    bucket: async () => bucketSchema.parse(await readJson(join(agentDir, 'accounts.json'), {})),
    auth: async () => authSchema.parse(await readJson(join(agentDir, 'auth.json'), {}))
  }
}

it('matches the Pi core fixture contract: sync outgoing, switch slot, preserve unrelated credentials, mirror', async () => {
  const f = await fixture()
  expect((await f.service.list()).accounts.find((a) => a.active)?.drift).toBe(true)
  const state = await f.service.use('anthropic', 'personal')
  expect(state.error).toBeUndefined()
  const bucket = await f.bucket()
  expect(bucket.active.anthropic).toBe('personal')
  expect(bucket.accounts.anthropic.work.access).toBe('fixture-renewed')
  expect((await f.auth()).anthropic).toEqual(bucket.accounts.anthropic.personal)
  expect((await f.auth()).other.key).toBe('fixture-only')
  const mirror = await readFile(join(f.home, '.claude', '.credentials.json'), 'utf8')
  expect(JSON.parse(mirror).claudeAiOauth.accessToken).toBe('fixture-personal')
  expect(f.security).not.toHaveBeenCalled()
  expect(JSON.stringify(state)).not.toContain('fixture-personal-refresh')
  expect(state.accounts.find((a) => a.active)?.drift).toBe(false)
})

it('using the active account preserves the refreshed slot', async () => {
  const f = await fixture()
  await f.service.use('anthropic', 'work')
  expect((await f.auth()).anthropic.access).toBe('fixture-renewed')
})

it('refuses unknown names and identity drift without modifying either file', async () => {
  const f = await fixture()
  const bucket = await f.bucket()
  const auth = await f.auth()
  bucket.accounts.anthropic.work.accountId = 'one'
  auth.anthropic.accountId = 'two'
  await writeJson(join(f.agentDir, 'accounts.json'), bucket)
  await writeJson(join(f.agentDir, 'auth.json'), auth)
  await expect(f.service.use('anthropic', '__proto__')).rejects.toThrow('not found')
  await expect(f.service.use('anthropic', 'personal')).rejects.toThrow('/accounts save')
  expect(await f.bucket()).toEqual(bucket)
  expect(await f.auth()).toEqual(auth)
})

it('publishes external bucket and auth changes, survives invalid JSON, and stops polling', async () => {
  const f = await fixture()
  const events: PiAccountsState[] = []
  const stop = f.service.watch((state) => events.push(state), 10)
  try {
    await vi.waitFor(() => expect(events.length).toBe(1))
    const bucket = await f.bucket()
    bucket.active.anthropic = 'personal'
    await writeJson(join(f.agentDir, 'accounts.json'), bucket)
    await vi.waitFor(() =>
      expect(events.at(-1)?.accounts.find((a) => a.active)?.name).toBe('personal')
    )
    const auth = await f.auth()
    auth.anthropic = bucket.accounts.anthropic.personal
    await writeJson(join(f.agentDir, 'auth.json'), auth)
    await vi.waitFor(() => expect(events.at(-1)?.accounts.find((a) => a.active)?.drift).toBe(false))
    await writeJson(join(f.agentDir, 'accounts.json'), { version: 2 })
    await vi.waitFor(() => expect(events.at(-1)?.error).toBe('read-failed'))
    await writeJson(join(f.agentDir, 'accounts.json'), bucket)
    await vi.waitFor(() => expect(events.at(-1)?.error).toBeUndefined())
  } finally {
    stop()
  }
})

it('reports partial mirror failure without claiming the Pi switch failed', async () => {
  const f = await fixture()
  const service = new PiAccountsService({
    mirror: async () => {
      throw new Error('fixture failure')
    }
  })
  expect((await service.use('anthropic', 'personal')).error).toBe('mirror-failed')
  expect((await f.bucket()).active.anthropic).toBe('personal')
})

it('uses fake security on macOS and cached Codex id tokens without external access', async () => {
  const f = await fixture()
  const security = vi.fn(async (_args: string[]) => ({ code: 0, stdout: '{}' }))
  const network = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: 'fixture-fresh',
          refresh_token: 'fixture-refresh',
          id_token: 'fixture-id',
          expires_in: 3600
        })
      )
  )
  const mirror = createAccountMirror({ home: f.home, platform: 'darwin', security, fetch: network })
  const statePath = join(f.agentDir, 'accounts-mirror.json')
  await mirror('anthropic', 'anthropic/work', (await f.auth()).anthropic, statePath)
  expect(security.mock.calls.map((call) => call[0][0])).toEqual([
    'find-generic-password',
    'add-generic-password'
  ])
  const cred = {
    access: 'fixture-old',
    refresh: 'fixture-old-refresh',
    accountId: 'fixture-account'
  }
  const next = (await mirror('openai-codex', 'openai-codex/work', cred, statePath)).cred
  expect(next.access).toBe('fixture-fresh')
  await mirror('openai-codex', 'openai-codex/work', next, statePath)
  expect(network).toHaveBeenCalledTimes(1)
  expect(
    JSON.parse(await readFile(join(f.home, '.codex', 'auth.json'), 'utf8')).tokens.id_token
  ).toBe('fixture-id')
})

it('persists the rotated Codex refresh token even when the mirror write fails afterwards', async () => {
  const f = await fixture()
  const bucket = await f.bucket()
  bucket.active['openai-codex'] = 'work'
  bucket.accounts['openai-codex'] = {
    work: { access: 'fixture-codex-old', refresh: 'fixture-codex-old-refresh', accountId: 'acct' }
  }
  await writeJson(join(f.agentDir, 'accounts.json'), bucket)
  // Why a file: it makes every write under ~/.codex fail after the refresh already rotated the token.
  await writeFile(join(f.home, '.codex'), 'not a directory')
  const mirror = createAccountMirror({
    home: f.home,
    platform: 'linux',
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: 'fixture-codex-fresh',
          refresh_token: 'fixture-codex-rotated',
          id_token: 'fixture-id',
          expires_in: 3600
        })
      )
  })
  const state = await new PiAccountsService({ mirror }).use('openai-codex', 'work')
  expect(state.error).toBe('mirror-failed')
  expect((await f.auth())['openai-codex'].refresh).toBe('fixture-codex-rotated')
  expect((await f.bucket()).accounts['openai-codex'].work.refresh).toBe('fixture-codex-rotated')
})

it('aborts the switch when Pi refreshes the same slot mid-mirror, keeping both credentials', async () => {
  const f = await fixture()
  const service = new PiAccountsService({
    mirror: async (_provider, _key, cred) => {
      const auth = await f.auth()
      auth.anthropic = {
        type: 'oauth',
        access: 'fixture-concurrent',
        refresh: 'fixture-concurrent-refresh',
        expires: 9000
      }
      await writeJson(join(f.agentDir, 'auth.json'), auth)
      return { cred: { ...cred, refresh: 'fixture-rotated' } }
    }
  })
  await expect(service.use('anthropic', 'personal')).rejects.toThrow('refreshed this provider')
  expect((await f.auth()).anthropic.access).toBe('fixture-concurrent')
  const bucket = await f.bucket()
  expect(bucket.active.anthropic).toBe('work')
  expect(bucket.accounts.anthropic.work.access).toBe('fixture-concurrent')
  expect(bucket.accounts.anthropic.personal.refresh).toBe('fixture-rotated')
})

it('treats a transient read error as no change instead of publishing a failure', async () => {
  const f = await fixture()
  const events: PiAccountsState[] = []
  vi.spyOn(f.service, 'list').mockRejectedValueOnce(
    Object.assign(new Error('locked'), { code: 'EBUSY' })
  )
  const stop = f.service.watch((state) => events.push(state), 5)
  try {
    await vi.waitFor(() => expect(events.length).toBe(1))
    expect(events[0].error).toBeUndefined()
    expect(events[0].accounts).not.toHaveLength(0)
  } finally {
    stop()
  }
})
