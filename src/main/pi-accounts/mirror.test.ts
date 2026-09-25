import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountMirror, type SecurityResult } from './mirror'

const homes: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'pi-mirror-'))
  homes.push(path)
  return path
}

const claudeCred = { access: 'fixture-access', refresh: 'fixture-refresh', expires: 4000 }

it('creates the Keychain item when it does not exist (exit 44) and refuses to overwrite on failure', async () => {
  const security = vi.fn(async (args: string[]): Promise<SecurityResult> =>
    args[0] === 'find-generic-password' ? { code: 44, stdout: '' } : { code: 0, stdout: '' }
  )
  const mirror = createAccountMirror({ home: await home(), platform: 'darwin', security })
  await mirror('anthropic', 'anthropic/work', claudeCred, 'unused')
  expect(security.mock.calls.map((call) => call[0][0])).toEqual([
    'find-generic-password',
    'add-generic-password'
  ])

  const failing = vi.fn(async (args: string[]): Promise<SecurityResult> =>
    args[0] === 'find-generic-password' ? { code: 1, stdout: '' } : { code: 0, stdout: '' }
  )
  const guarded = createAccountMirror({ home: await home(), platform: 'darwin', security: failing })
  await expect(guarded('anthropic', 'anthropic/work', claudeCred, 'unused')).rejects.toThrow(
    'Keychain read failed'
  )
  expect(failing.mock.calls.map((call) => call[0][0])).toEqual(['find-generic-password'])
})

it('scopes the Keychain service to CLAUDE_CONFIG_DIR and falls back to the Claude Code account', async () => {
  const base = await home()
  const configDir = join(base, 'claude-config')
  vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
  vi.stubEnv('USER', 'first@example.com')
  const security = vi.fn(async (args: string[]): Promise<SecurityResult> =>
    args[0] === 'find-generic-password' ? { code: 44, stdout: '' } : { code: 0, stdout: '' }
  )
  const mirror = createAccountMirror({ home: base, platform: 'darwin', security })
  await mirror('anthropic', 'anthropic/work', claudeCred, 'unused')
  const suffix = createHash('sha256').update(configDir.normalize('NFC')).digest('hex').slice(0, 8)
  const services = security.mock.calls.map((call) => call[0][call[0].indexOf('-s') + 1])
  expect(services[0]).toBe(`Claude Code-credentials-${suffix}`)
  expect(services).toContain('Claude Code-credentials')
  for (const call of security.mock.calls) {
    expect(call[0][call[0].indexOf('-a') + 1]).toBe('claude-code-user')
  }
})

it('writes .credentials.json under CLAUDE_CONFIG_DIR off macOS', async () => {
  const base = await home()
  const configDir = join(base, 'elsewhere')
  vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
  const mirror = createAccountMirror({ home: base, platform: 'linux' })
  await mirror('anthropic', 'anthropic/work', claudeCred, 'unused')
  const written = JSON.parse(await readFile(join(configDir, '.credentials.json'), 'utf8'))
  expect(written.claudeAiOauth.accessToken).toBe('fixture-access')
})

it('drops identity fields of the previous account but keeps plan metadata', async () => {
  const base = await home()
  const path = join(base, '.claude', '.credentials.json')
  await mkdir(join(base, '.claude'), { recursive: true })
  await writeFile(
    path,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: 'other-access',
        refreshToken: 'other-refresh',
        emailAddress: 'a@example.com',
        organizationUuid: 'org-a',
        accountUuid: 'acct-a',
        scopes: ['user:inference'],
        subscriptionType: 'pro',
        rateLimitTier: 'default'
      }
    })
  )
  const mirror = createAccountMirror({ home: base, platform: 'linux' })
  await mirror('anthropic', 'anthropic/work', claudeCred, 'unused')
  const blob = JSON.parse(await readFile(path, 'utf8')).claudeAiOauth
  expect(blob).toEqual({
    accessToken: 'fixture-access',
    refreshToken: 'fixture-refresh',
    expiresAt: 4000,
    scopes: ['user:inference'],
    subscriptionType: 'pro',
    rateLimitTier: 'default'
  })
  await mirror('anthropic', 'anthropic/work', { ...claudeCred, expires: 5000 }, 'unused')
  expect(JSON.parse(await readFile(path, 'utf8')).claudeAiOauth.expiresAt).toBe(5000)
})

it('keeps the refreshed Codex credential when the Codex auth file is corrupt', async () => {
  const base = await home()
  await mkdir(join(base, '.codex'), { recursive: true })
  await writeFile(join(base, '.codex', 'auth.json'), '{ not json')
  const mirror = createAccountMirror({
    home: base,
    platform: 'linux',
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: 'fixture-fresh',
          refresh_token: 'fixture-rotated',
          id_token: 'fixture-id',
          expires_in: 3600
        })
      )
  })
  const result = await mirror(
    'openai-codex',
    'openai-codex/work',
    { access: 'old', refresh: 'old-refresh', accountId: 'acct' },
    join(base, 'mirror-state.json')
  )
  expect(result.cred.refresh).toBe('fixture-rotated')
  expect(result.error).toBeUndefined()
  const written = JSON.parse(await readFile(join(base, '.codex', 'auth.json'), 'utf8'))
  expect(written.tokens.refresh_token).toBe('fixture-rotated')
})

it('reports a post-refresh write failure instead of throwing away the rotated token', async () => {
  const base = await home()
  await writeFile(join(base, '.codex'), 'not a directory')
  const mirror = createAccountMirror({
    home: base,
    platform: 'linux',
    fetch: async () =>
      new Response(
        JSON.stringify({
          access_token: 'fixture-fresh',
          refresh_token: 'fixture-rotated',
          id_token: 'fixture-id',
          expires_in: 3600
        })
      )
  })
  const result = await mirror(
    'openai-codex',
    'openai-codex/work',
    { access: 'old', refresh: 'old-refresh', accountId: 'acct' },
    join(base, 'mirror-state.json')
  )
  expect(result).toEqual({
    cred: expect.objectContaining({ access: 'fixture-fresh', refresh: 'fixture-rotated' }),
    error: 'mirror-failed'
  })
})
