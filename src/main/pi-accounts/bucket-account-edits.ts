import type { PiAccountProvider } from '../../shared/pi-accounts'
import type { Bucket, Credential } from './files'
import type { PiCapturedAccount } from './credential-conversion'

export const PI_ACCOUNT_NAME_PATTERN = /^[\w.@+-]{1,64}$/u

export function isValidPiAccountName(name: string): boolean {
  return PI_ACCOUNT_NAME_PATTERN.test(name)
}

function entries(bucket: Bucket, provider: PiAccountProvider): Record<string, Credential> {
  return bucket.accounts[provider] ?? {}
}

/**
 * The bucket account that already holds this identity, if any.
 * Codex carries `accountId`; Claude credentials carry no identity, so the saved name — which
 * defaults to the account email — plus the refresh token are all there is to compare.
 */
export function findDuplicatePiAccount(
  bucket: Bucket,
  captured: PiCapturedAccount,
  requestedName: string
): string | null {
  const existing = Object.entries(entries(bucket, captured.provider))
  const byAccountId = captured.identity.accountId
    ? existing.find(([, cred]) => cred.accountId === captured.identity.accountId)
    : undefined
  if (byAccountId) {
    return byAccountId[0]
  }
  const byToken = existing.find(([, cred]) => cred.refresh === captured.cred.refresh)
  if (byToken) {
    return byToken[0]
  }
  const wanted = requestedName.toLowerCase()
  return existing.find(([name]) => name.toLowerCase() === wanted)?.[0] ?? null
}

export function insertPiAccount(
  bucket: Bucket,
  provider: PiAccountProvider,
  name: string,
  cred: Credential
): void {
  bucket.accounts[provider] ??= {}
  bucket.accounts[provider][name] = cred
}

export type PiAccountRemovalOutcome = 'removed' | 'missing' | 'active-in-use'

/**
 * Removes a saved account. The active one may only go when it is the provider's last account:
 * dropping it while others remain would leave `auth.json` holding a credential no bucket entry
 * owns, which is exactly the state that blocks `/accounts use` on both sides.
 * The `auth.json` slot itself is never touched here — Pi keeps working with the signed-in session.
 */
export function removePiAccount(
  bucket: Bucket,
  provider: PiAccountProvider,
  name: string
): PiAccountRemovalOutcome {
  const accounts = entries(bucket, provider)
  if (!Object.hasOwn(accounts, name)) {
    return 'missing'
  }
  if (bucket.active[provider] === name) {
    if (Object.keys(accounts).length > 1) {
      return 'active-in-use'
    }
    delete bucket.active[provider]
  }
  delete bucket.accounts[provider][name]
  return 'removed'
}

export type PiAccountRenameOutcome = 'renamed' | 'missing' | 'name-taken' | 'invalid-name'

export function renamePiAccount(
  bucket: Bucket,
  provider: PiAccountProvider,
  from: string,
  to: string
): PiAccountRenameOutcome {
  const accounts = entries(bucket, provider)
  if (!Object.hasOwn(accounts, from)) {
    return 'missing'
  }
  if (!isValidPiAccountName(to)) {
    return 'invalid-name'
  }
  if (from !== to && Object.hasOwn(accounts, to)) {
    return 'name-taken'
  }
  bucket.accounts[provider][to] = accounts[from]
  if (from !== to) {
    delete bucket.accounts[provider][from]
  }
  if (bucket.active[provider] === from) {
    bucket.active[provider] = to
  }
  return 'renamed'
}
