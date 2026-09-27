import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { fetchClaudeOAuthUsage } from '../rate-limits/claude-oauth-usage-request'
import { fetchCodexRateLimitsViaBackend } from '../rate-limits/codex-backend-usage-client'
import type { PiAccountCredential } from './pi-account-credentials'

function backendRequest(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init)
}

function codexUsageUnavailable(error: string): ProviderRateLimits {
  return {
    provider: 'codex',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status: 'error'
  }
}

/**
 * Reads one bucket account's quota straight from its stored OAuth token. Callers must check
 * `hasUsableAccessToken` first: this never refreshes, so an expired token would only 401.
 */
export async function fetchPiAccountUsage(
  credential: PiAccountCredential,
  signal?: AbortSignal
): Promise<ProviderRateLimits> {
  const access = credential.access
  if (!access) {
    return codexUsageUnavailable('No credentials')
  }
  if (credential.provider === 'anthropic') {
    return fetchClaudeOAuthUsage(access, signal)
  }
  const limits = await fetchCodexRateLimitsViaBackend(backendRequest, {
    backendCredentials: {
      accessToken: access,
      accountId: credential.accountId
    },
    signal
  })
  return limits ?? codexUsageUnavailable('Codex usage is unavailable')
}
