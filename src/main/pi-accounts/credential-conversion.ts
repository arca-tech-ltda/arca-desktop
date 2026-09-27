import { z } from 'zod'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import type { Credential } from './files'

/** What a captured CLI login yields once it is expressed in Pi's bucket format. */
export type PiCapturedAccount = {
  provider: PiAccountProvider
  cred: Credential
  /** Stable identity used to refuse a second copy of the same account. */
  identity: {
    email: string | null
    accountId: string | null
    organizationUuid: string | null
  }
  /** Default account name; the user can rename it afterwards. */
  suggestedName: string
  /** Codex only: the mirror cache needs it to rebuild ~/.codex/auth.json. */
  codexIdToken?: string
}

const claudeBlobSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number()
  })
})
const codexAuthSchema = z.object({
  tokens: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    id_token: z.string().optional(),
    account_id: z.string().optional()
  })
})
const codexClaimsSchema = z.object({
  exp: z.number().optional(),
  'https://api.openai.com/auth': z.object({ chatgpt_account_id: z.string().optional() }).optional(),
  'https://api.openai.com/profile': z.object({ email: z.string().optional() }).optional()
})

function decodeJwtClaims(token: string): z.infer<typeof codexClaimsSchema> | null {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    )
    return codexClaimsSchema.parse(payload)
  } catch {
    return null
  }
}

/** Identity carried inside a Codex access token; the token itself stays in main. */
export function readCodexAccessTokenIdentity(access: string | undefined): {
  email: string | null
  accountId: string | null
} {
  const claims = access ? decodeJwtClaims(access) : null
  return {
    email: claims?.['https://api.openai.com/profile']?.email?.trim() || null,
    accountId: claims?.['https://api.openai.com/auth']?.chatgpt_account_id ?? null
  }
}

function sanitizeName(candidate: string | null | undefined, fallback: string): string {
  // Pi's /accounts parses `save <provider> <name>` on whitespace, so a name with spaces is unusable there.
  const trimmed = (candidate ?? '').trim().replace(/\s+/gu, '-')
  return trimmed && trimmed.length <= 64 ? trimmed : fallback
}

/** Claude Code `.credentials.json` (file or Keychain blob) → Pi credential. */
export function convertClaudeCredentialsToPiAccount(
  credentialsJson: string,
  identity: { email?: string | null; organizationUuid?: string | null } = {}
): PiCapturedAccount {
  let parsed: unknown
  try {
    parsed = JSON.parse(credentialsJson)
  } catch {
    throw new Error('Claude sign-in returned credentials ARCA could not read.')
  }
  const blob = claudeBlobSchema.safeParse(parsed)
  if (!blob.success) {
    throw new Error('Claude sign-in did not return an OAuth credential.')
  }
  const oauth = blob.data.claudeAiOauth
  const email = identity.email?.trim() || null
  return {
    provider: 'anthropic',
    cred: {
      type: 'oauth',
      access: oauth.accessToken,
      refresh: oauth.refreshToken,
      expires: oauth.expiresAt
    },
    identity: {
      email,
      accountId: null,
      organizationUuid: identity.organizationUuid ?? null
    },
    suggestedName: sanitizeName(email, 'claude')
  }
}

/** Codex CLI `auth.json` → Pi credential; expiry and account id come from the access token. */
export function convertCodexAuthToPiAccount(authJson: string): PiCapturedAccount {
  let parsed: unknown
  try {
    parsed = JSON.parse(authJson)
  } catch {
    throw new Error('Codex sign-in returned credentials ARCA could not read.')
  }
  const auth = codexAuthSchema.safeParse(parsed)
  if (!auth.success) {
    throw new Error('Codex sign-in did not return an OAuth credential.')
  }
  const tokens = auth.data.tokens
  const claims = decodeJwtClaims(tokens.access_token)
  const accountId = claims?.['https://api.openai.com/auth']?.chatgpt_account_id ?? tokens.account_id
  if (!accountId) {
    throw new Error('Codex sign-in did not return an account id.')
  }
  const email = claims?.['https://api.openai.com/profile']?.email?.trim() || null
  return {
    provider: 'openai-codex',
    cred: {
      type: 'oauth',
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      // Pi refreshes on expiry; an unreadable access token just means "refresh on first use".
      expires: typeof claims?.exp === 'number' ? claims.exp * 1000 : 0,
      accountId
    },
    identity: { email, accountId, organizationUuid: null },
    suggestedName: sanitizeName(email, `codex-${accountId.slice(0, 8)}`),
    ...(tokens.id_token ? { codexIdToken: tokens.id_token } : {})
  }
}
