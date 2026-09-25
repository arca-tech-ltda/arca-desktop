// Port of arca/extensions/lib/account-mirror.ts; Pi owns the mirror cache too.
// Known asymmetry (documented, not fixed here): this side only pushes. Adopting a refresh made by
// the Claude/Codex CLI back into the bucket is Pi's `pull*` path, reached through /accounts sync.
// The Codex id_token cache stays in the shared ~/.pi/agent/accounts-mirror.json for the same reason.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { runProcess } from '../../shared/child-process/run-process'
import {
  getActiveClaudeKeychainServices,
  getClaudeKeychainAccount
} from '../claude-accounts/keychain'
import { ClaudeRuntimePathResolver } from '../claude-accounts/runtime-paths'
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
// Everything else in the blob (emailAddress, organizationUuid, accountUuid…) identifies the account.
const carriedClaudeKeys = ['scopes', 'subscriptionType', 'rateLimitTier']
const keychainTimeoutMs = 15_000
const keychainNotFoundExit = 44

export type SecurityResult = { code: number; stdout: string }
/** `cred` is always the credential the caller must persist, even when `error` is set (B1). */
export type MirrorResult = { cred: Credential; error?: string }

export type MirrorOptions = {
  home?: string
  platform?: NodeJS.Platform
  security?: (args: string[]) => Promise<SecurityResult>
  fetch?: typeof fetch
}

export function createAccountMirror(options: MirrorOptions = {}) {
  const home = options.home ?? homedir()
  const platform = options.platform ?? process.platform
  // Claude Code reads CLAUDE_CONFIG_DIR for both the file and the Keychain service scope.
  const inheritedConfigDir = new ClaudeRuntimePathResolver().getRuntimePaths().envPatch
    .CLAUDE_CONFIG_DIR
  const claudeConfigDir = inheritedConfigDir ?? join(home, '.claude')
  const security =
    options.security ??
    (async (args: string[]): Promise<SecurityResult> => {
      const result = await runProcess({
        program: '/usr/bin/security',
        args,
        timeoutMs: keychainTimeoutMs
      })
      if (result.timedOut) {
        throw new Error('Claude Keychain timed out')
      }
      return { code: result.code ?? 1, stdout: result.stdout }
    })

  // A missing item (exit 44) is an empty blob; any other failure must not overwrite it (I3).
  const readKeychain = async (): Promise<Record<string, unknown>> => {
    const account = getClaudeKeychainAccount()
    for (const service of getActiveClaudeKeychainServices(inheritedConfigDir)) {
      const result = await security(['find-generic-password', '-s', service, '-a', account, '-w'])
      if (result.code === keychainNotFoundExit) {
        continue
      }
      if (result.code !== 0) {
        throw new Error('Claude Keychain read failed')
      }
      try {
        return objectSchema.parse(JSON.parse(result.stdout.trim()))
      } catch {
        return {}
      }
    }
    return {}
  }

  const writeKeychain = async (contents: string): Promise<void> => {
    const account = getClaudeKeychainAccount()
    for (const service of getActiveClaudeKeychainServices(inheritedConfigDir)) {
      const result = await security([
        'add-generic-password',
        '-U',
        '-a',
        account,
        '-s',
        service,
        '-w',
        contents
      ])
      if (result.code !== 0) {
        throw new Error('Claude Keychain write failed')
      }
    }
  }

  const mirrorClaude = async (cred: Credential): Promise<MirrorResult> => {
    if (typeof cred.expires !== 'number') {
      throw new Error('Incomplete Pi Claude credential')
    }
    const path = join(claudeConfigDir, '.credentials.json')
    const current =
      platform === 'darwin' ? await readKeychain() : objectSchema.parse(await readJson(path, {}))
    const previous = objectSchema.parse(current.claudeAiOauth ?? {})
    // Identity keys belong to whichever account wrote them; only carry them when it is the same one (I6).
    const sameAccount =
      previous.refreshToken === cred.refresh || previous.accessToken === cred.access
    const carried = sameAccount
      ? previous
      : Object.fromEntries(
          carriedClaudeKeys.filter((key) => key in previous).map((key) => [key, previous[key]])
        )
    const out = {
      ...current,
      claudeAiOauth: {
        ...carried,
        accessToken: cred.access,
        refreshToken: cred.refresh,
        expiresAt: cred.expires,
        scopes: carried.scopes ?? scopes,
        subscriptionType: carried.subscriptionType ?? 'max'
      }
    }
    await (platform === 'darwin' ? writeKeychain(JSON.stringify(out)) : writeJson(path, out))
    return { cred }
  }

  const mirrorCodex = async (
    key: string,
    cred: Credential,
    statePath: string
  ): Promise<MirrorResult> => {
    if (!cred.accountId) {
      throw new Error('Incomplete Pi Codex credential')
    }
    const state = cacheSchema.parse(await readJson(statePath, { version: 1, codexIdTokens: {} }))
    let idToken = state.codexIdTokens[key]
    let next = cred
    let error: string | undefined
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
          refresh_token: cred.refresh ?? '',
          client_id: 'app_EMoamEEZ73f0CkXaXp7hrann'
        }),
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) {
        throw new Error(`Codex refresh failed (${response.status})`)
      }
      const fresh = tokenSchema.parse(await response.json())
      idToken = fresh.id_token
      // Past this point the old refresh token is dead: report failures, never throw them (B1).
      next = {
        ...cred,
        access: fresh.access_token,
        refresh: fresh.refresh_token,
        expires: Date.now() + fresh.expires_in * 1000
      }
      state.codexIdTokens[key] = idToken
      try {
        await writeJson(statePath, state)
      } catch {
        error = 'mirror-failed'
      }
    }
    const path = join(home, '.codex', 'auth.json')
    let current: Record<string, unknown> = {}
    try {
      current = objectSchema.parse(await readJson(path, {}))
    } catch {
      /* A corrupt Codex auth.json is replaced, not honoured. */
    }
    try {
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
    } catch (writeError) {
      if (next === cred) {
        throw writeError
      }
      error = 'mirror-failed'
    }
    return { cred: next, ...(error ? { error } : {}) }
  }

  return async (
    provider: PiAccountProvider,
    key: string,
    cred: Credential,
    statePath: string
  ): Promise<MirrorResult> => {
    if (!cred.access || !cred.refresh) {
      throw new Error('Incomplete Pi OAuth credential')
    }
    return provider === 'anthropic' ? mirrorClaude(cred) : mirrorCodex(key, cred, statePath)
  }
}
