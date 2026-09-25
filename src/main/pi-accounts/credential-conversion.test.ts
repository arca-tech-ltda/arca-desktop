import { expect, it } from 'vitest'
import {
  convertClaudeCredentialsToPiAccount,
  convertCodexAuthToPiAccount
} from './credential-conversion'

function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

const codexAccess = jwt({
  exp: 1_700_000_000,
  'https://api.openai.com/auth': { chatgpt_account_id: 'acct-123' },
  'https://api.openai.com/profile': { email: 'dev@example.com' }
})

it('converts a Claude Code credentials blob into a Pi OAuth credential', () => {
  const converted = convertClaudeCredentialsToPiAccount(
    JSON.stringify({
      claudeAiOauth: {
        accessToken: 'sk-ant-oat-access',
        refreshToken: 'sk-ant-ort-refresh',
        expiresAt: 4_000,
        scopes: ['user:inference'],
        subscriptionType: 'max'
      }
    }),
    { email: 'Dev@example.com ', organizationUuid: 'org-1' }
  )
  expect(converted.cred).toEqual({
    type: 'oauth',
    access: 'sk-ant-oat-access',
    refresh: 'sk-ant-ort-refresh',
    expires: 4_000
  })
  expect(converted.suggestedName).toBe('Dev@example.com')
  expect(converted.identity).toEqual({
    email: 'Dev@example.com',
    accountId: null,
    organizationUuid: 'org-1'
  })
})

it('rejects a Claude blob without OAuth tokens', () => {
  expect(() => convertClaudeCredentialsToPiAccount('{"claudeAiOauth":{}}')).toThrow(
    'did not return an OAuth credential'
  )
  expect(() => convertClaudeCredentialsToPiAccount('not json')).toThrow('could not read')
})

it('converts a Codex auth.json, taking expiry and account id from the access token', () => {
  const converted = convertCodexAuthToPiAccount(
    JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: {
        access_token: codexAccess,
        refresh_token: 'codex-refresh',
        id_token: 'codex-id-token',
        account_id: 'ignored-when-jwt-has-one'
      }
    })
  )
  expect(converted.cred).toEqual({
    type: 'oauth',
    access: codexAccess,
    refresh: 'codex-refresh',
    expires: 1_700_000_000_000,
    accountId: 'acct-123'
  })
  expect(converted.codexIdToken).toBe('codex-id-token')
  expect(converted.suggestedName).toBe('dev@example.com')
})

it('falls back to the stored account id and a refresh-on-use expiry', () => {
  const converted = convertCodexAuthToPiAccount(
    JSON.stringify({
      tokens: { access_token: 'opaque', refresh_token: 'r', account_id: 'acct-fallback' }
    })
  )
  expect(converted.cred.accountId).toBe('acct-fallback')
  expect(converted.cred.expires).toBe(0)
  expect(converted.suggestedName).toBe('codex-acct-fal')
  expect(converted.codexIdToken).toBeUndefined()
})

it('refuses a Codex login with no resolvable account id', () => {
  expect(() =>
    convertCodexAuthToPiAccount(
      JSON.stringify({ tokens: { access_token: 'a', refresh_token: 'r' } })
    )
  ).toThrow('account id')
})
