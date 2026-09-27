import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bucketSchema, readJson, writeJson } from './files'
import { readCodexIdToken } from './codex-id-token-cache'
import type { PiCapturedAccount } from './credential-conversion'
import { PiAccountEditor } from './pi-account-editor'
import { PiAccountProjectsService } from './account-project-map'
import { PiAccountsService } from './service'

const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

const claudeCapture: PiCapturedAccount = {
  provider: 'anthropic',
  cred: { type: 'oauth', access: 'new-access', refresh: 'new-refresh', expires: 9_000 },
  identity: { email: 'dev@example.com', accountId: null, organizationUuid: null },
  suggestedName: 'dev@example.com'
}

async function fixture(capture: PiCapturedAccount = claudeCapture) {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-accounts-edit-'))
  homes.push(agentDir)
  const login = vi.fn(async () => capture)
  const editor = new PiAccountEditor(agentDir, () => login)
  const service = new PiAccountsService({ agentDir, editor, mirrorEnabled: false })
  return {
    agentDir,
    login,
    service,
    seed: (bucket: unknown, auth?: unknown) =>
      Promise.all([
        writeJson(join(agentDir, 'accounts.json'), bucket),
        auth ? writeJson(join(agentDir, 'auth.json'), auth) : Promise.resolve()
      ]),
    bucket: async () =>
      bucketSchema.parse(
        await readJson(join(agentDir, 'accounts.json'), { version: 1, active: {}, accounts: {} })
      )
  }
}

it('saves a captured login into the bucket, lists it, and never returns the tokens', async () => {
  const f = await fixture()
  const result = await f.service.add('anthropic')
  expect(result.status).toBe('added')
  expect(result.name).toBe('dev@example.com')
  expect((await f.bucket()).accounts.anthropic['dev@example.com']).toEqual(claudeCapture.cred)
  expect(result.state.accounts).toEqual([
    { provider: 'anthropic', name: 'dev@example.com', active: false, drift: false }
  ])
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('new-access')
  expect(serialized).not.toContain('new-refresh')
})

it('adding never rewrites the live auth.json slot', async () => {
  const f = await fixture()
  await f.seed({ version: 1, active: {}, accounts: {} }, { anthropic: { access: 'in-use' } })
  await f.service.add('anthropic')
  expect(await readJson(join(f.agentDir, 'auth.json'), {})).toEqual({
    anthropic: { access: 'in-use' }
  })
})

it('caches the Codex id token for the mirror under the saved account key', async () => {
  const f = await fixture({
    provider: 'openai-codex',
    cred: { type: 'oauth', access: 'a', refresh: 'r', expires: 1, accountId: 'acct-1' },
    identity: { email: null, accountId: 'acct-1', organizationUuid: null },
    suggestedName: 'codex-acct-1',
    codexIdToken: 'id-token-1'
  })
  const result = await f.service.add('openai-codex')
  expect(result.status).toBe('added')
  expect(
    await readCodexIdToken(join(f.agentDir, 'accounts-mirror.json'), 'openai-codex/codex-acct-1')
  ).toBe('id-token-1')
})

it('refuses a second copy of the same identity', async () => {
  const codexCapture: PiCapturedAccount = {
    provider: 'openai-codex',
    cred: { type: 'oauth', access: 'a', refresh: 'r', expires: 1, accountId: 'acct-1' },
    identity: { email: 'dev@example.com', accountId: 'acct-1', organizationUuid: null },
    suggestedName: 'dev@example.com'
  }
  const f = await fixture(codexCapture)
  await f.seed({
    version: 1,
    active: {},
    accounts: { 'openai-codex': { saved: { ...codexCapture.cred, access: 'older' } } }
  })
  const result = await f.service.add('openai-codex')
  expect(result).toMatchObject({ status: 'duplicate', name: 'saved' })
  expect(Object.keys((await f.bucket()).accounts['openai-codex'])).toEqual(['saved'])
})

it('refuses a Claude re-login saved under the same name', async () => {
  const f = await fixture()
  await f.seed({
    version: 1,
    active: {},
    accounts: { anthropic: { 'DEV@example.com': { type: 'oauth', access: 'x', refresh: 'y' } } }
  })
  expect(await f.service.add('anthropic')).toMatchObject({
    status: 'duplicate',
    name: 'DEV@example.com'
  })
})

it('reports a cancelled sign-in without touching the bucket', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-accounts-edit-'))
  homes.push(agentDir)
  const editor = new PiAccountEditor(agentDir, () => async () => {
    throw new Error('Claude sign-in was cancelled.')
  })
  const service = new PiAccountsService({ agentDir, editor, mirrorEnabled: false })
  expect(await service.add('anthropic')).toEqual({ status: 'cancelled', state: { accounts: [] } })
})

it('hides sign-in failure details from the renderer', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-accounts-edit-'))
  homes.push(agentDir)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const editor = new PiAccountEditor(agentDir, () => async () => {
    throw new Error('codex printed refresh_token=leaked')
  })
  const service = new PiAccountsService({ agentDir, editor, mirrorEnabled: false })
  const result = await service.add('openai-codex')
  expect(result.status).toBe('failed')
  expect(JSON.stringify(result)).not.toContain('leaked')
  warn.mockRestore()
})

it('removes an inactive account and keeps the active one', async () => {
  const f = await fixture()
  await f.seed({
    version: 1,
    active: { anthropic: 'work' },
    accounts: {
      anthropic: {
        work: { type: 'oauth', access: 'w', refresh: 'wr' },
        personal: { type: 'oauth', access: 'p', refresh: 'pr' }
      }
    }
  })
  expect(await f.service.remove('anthropic', 'personal')).toMatchObject({ status: 'removed' })
  const bucket = await f.bucket()
  expect(Object.keys(bucket.accounts.anthropic)).toEqual(['work'])
  expect(bucket.active.anthropic).toBe('work')
})

it('refuses to remove the active account while another one could take the slot', async () => {
  const f = await fixture()
  await f.seed({
    version: 1,
    active: { anthropic: 'work' },
    accounts: {
      anthropic: {
        work: { type: 'oauth', access: 'w', refresh: 'wr' },
        personal: { type: 'oauth', access: 'p', refresh: 'pr' }
      }
    }
  })
  expect(await f.service.remove('anthropic', 'work')).toMatchObject({ status: 'active-in-use' })
  expect(Object.keys((await f.bucket()).accounts.anthropic)).toEqual(['work', 'personal'])
})

it('removes the last account of a provider and leaves the auth.json slot alone', async () => {
  const f = await fixture()
  const slot = { type: 'oauth', access: 'w', refresh: 'wr' }
  await f.seed(
    { version: 1, active: { anthropic: 'work' }, accounts: { anthropic: { work: slot } } },
    { anthropic: slot }
  )
  expect(await f.service.remove('anthropic', 'work')).toMatchObject({ status: 'removed' })
  const bucket = await f.bucket()
  expect(bucket.accounts.anthropic).toEqual({})
  expect(bucket.active.anthropic).toBeUndefined()
  expect(await readJson(join(f.agentDir, 'auth.json'), {})).toEqual({ anthropic: slot })
})

it('renames an account, following the active pointer, and rejects taken or invalid names', async () => {
  const f = await fixture()
  await f.seed({
    version: 1,
    active: { anthropic: 'work' },
    accounts: {
      anthropic: {
        work: { type: 'oauth', access: 'w', refresh: 'wr' },
        personal: { type: 'oauth', access: 'p', refresh: 'pr' }
      }
    }
  })
  expect(await f.service.rename('anthropic', 'work', 'job')).toMatchObject({ status: 'renamed' })
  const bucket = await f.bucket()
  expect(bucket.active.anthropic).toBe('job')
  expect(Object.keys(bucket.accounts.anthropic).sort()).toEqual(['job', 'personal'])
  expect(await f.service.rename('anthropic', 'job', 'personal')).toMatchObject({
    status: 'name-taken'
  })
  expect(await f.service.rename('anthropic', 'job', 'two words')).toMatchObject({
    status: 'invalid-name'
  })
  expect(await f.service.rename('anthropic', 'missing', 'other')).toMatchObject({
    status: 'missing'
  })
})

it('refuses to rename an account an open terminal is running on', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-accounts-edit-'))
  homes.push(agentDir)
  const projects = new PiAccountProjectsService({ agentDir })
  const service = new PiAccountsService({ agentDir, mirrorEnabled: false, projects })
  await writeJson(join(agentDir, 'accounts.json'), {
    version: 1,
    active: { anthropic: 'work' },
    accounts: { anthropic: { work: { type: 'oauth', access: 'w', refresh: 'wr' } } }
  })
  projects.recordSession({ tabId: 'tab-1', provider: 'anthropic', name: 'work' })
  expect(await service.rename('anthropic', 'work', 'job')).toMatchObject({
    status: 'open-in-terminal',
    blockedBy: { terminals: 1 }
  })
  expect(
    Object.keys(
      bucketSchema.parse(await readJson(join(agentDir, 'accounts.json'), {})).accounts.anthropic
    )
  ).toEqual(['work'])
  // The renderer prunes closed tabs before the check; then the rename goes through.
  projects.syncOpenTabs([])
  expect(await service.rename('anthropic', 'work', 'job')).toMatchObject({ status: 'renamed' })
})
