// Port of arca/extensions/lib/account-mirror.ts; Pi owns the mirror cache too.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { runProcess } from '../../shared/child-process/run-process'
import { readJson, writeJson, type Credential } from './files'
import type { PiAccountProvider } from '../../shared/pi-accounts'

const objectSchema = z.record(z.string(), z.unknown())
const cacheSchema = z.object({
  version: z.literal(1),
  codexIdTokens: z.record(z.string(), z.string())
})
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
  expires_in: z.number()
})
const scopes = [
  'user:file_upload',
  'user:inference',
  'user:mcp_servers',
  'user:profile',
  'user:sessions:claude_code'
]
const service = 'Claude Code-credentials'

export type MirrorOptions = {
  home?: string
  platform?: NodeJS.Platform
  security?: (args: string[]) => Promise<string>
  fetch?: typeof fetch
}

export function createAccountMirror(options: MirrorOptions = {}) {
  const home = options.home ?? homedir()
  const platform = options.platform ?? process.platform
  const security =
    options.security ??
    (async (args: string[]): Promise<string> => {
      const result = await runProcess({ program: '/usr/bin/security', args, timeoutMs: 3000 })
      if (result.code !== 0 || result.timedOut) {
        throw new Error('Claude Keychain operation failed')
      }
      return result.stdout
    })
  return async (
    provider: PiAccountProvider,
    key: string,
    cred: Credential,
    statePath: string
  ): Promise<Credential> => {
    if (!cred.access || !cred.refresh) {
      throw new Error('Incomplete Pi OAuth credential')
    }
    if (provider === 'anthropic') {
      if (typeof cred.expires !== 'number') {
        throw new Error('Incomplete Pi Claude credential')
      }
      const path = join(home, '.claude', '.credentials.json')
      let current: Record<string, unknown>
      if (platform === 'darwin') {
        try {
          current = objectSchema.parse(
            JSON.parse(await security(['find-generic-password', '-s', service, '-w']))
          )
        } catch {
          current = {}
        }
      } else {
        current = objectSchema.parse(await readJson(path, {}))
      }
      const previous = objectSchema.parse(current.claudeAiOauth ?? {})
      const out = {
        ...current,
        claudeAiOauth: {
          ...previous,
          accessToken: cred.access,
          refreshToken: cred.refresh,
          expiresAt: cred.expires,
          scopes: previous.scopes ?? scopes,
          subscriptionType: previous.subscriptionType ?? 'max'
        }
      }
      await (platform === 'darwin'
        ? security([
            'add-generic-password',
            '-U',
            '-a',
            process.env.USER ?? 'pi',
            '-s',
            service,
            '-w',
            JSON.stringify(out)
          ])
        : writeJson(path, out))
      return cred
    }
    if (!cred.accountId) {
      throw new Error('Incomplete Pi Codex credential')
    }
    const state = cacheSchema.parse(await readJson(statePath, { version: 1, codexIdTokens: {} }))
    let idToken = state.codexIdTokens[key]
    let next = cred
    let expires: number | undefined
    try {
      const payload = objectSchema.parse(
        JSON.parse(Buffer.from(idToken?.split('.')[1] ?? '', 'base64url').toString('utf8'))
      )
      if (typeof payload.exp === 'number') {
        expires = payload.exp * 1000
      }
    } catch {
      /* Pi also accepts cached opaque id tokens. */
    }
    if (!idToken || (expires !== undefined && expires < Date.now() + 60_000)) {
      const response = await (options.fetch ?? fetch)('https://auth.openai.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: cred.refresh,
          client_id: 'app_EMoamEEZ73f0CkXaXp7hrann'
        }),
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) {
        throw new Error(`Codex refresh failed (${response.status})`)
      }
      const fresh = tokenSchema.parse(await response.json())
      idToken = fresh.id_token
      next = {
        ...cred,
        access: fresh.access_token,
        refresh: fresh.refresh_token,
        expires: Date.now() + fresh.expires_in * 1000
      }
      state.codexIdTokens[key] = idToken
      await writeJson(statePath, state)
    }
    const path = join(home, '.codex', 'auth.json')
    const current = objectSchema.parse(await readJson(path, {}))
    await writeJson(path, {
      ...current,
      auth_mode: current.auth_mode ?? 'chatgpt',
      OPENAI_API_KEY: current.OPENAI_API_KEY ?? null,
      tokens: {
        id_token: idToken,
        access_token: next.access,
        refresh_token: next.refresh,
        account_id: next.accountId
      },
      last_refresh: new Date().toISOString()
    })
    return next
  }
}
