import type { Auth, Bucket, Credential } from './files'

export function saveFirst(provider: string): Error {
  return new Error(`Save the current slot first: /accounts save ${provider} <name>`)
}

// Key order survives neither the schema parse nor a rebuild, so compare the entries, not the text.
export function sameCredential(
  left: Credential | undefined,
  right: Credential | undefined
): boolean {
  const canonical = (cred: Credential | undefined): string =>
    cred ? JSON.stringify(Object.entries(cred).sort(([a], [b]) => a.localeCompare(b))) : 'null'
  return canonical(left) === canonical(right)
}

/** Contract v1 §9: the slot is that account's copy only while it still holds its refresh token. */
export function isSlotCopyOf(
  slot: Credential | undefined,
  stored: Credential | undefined
): boolean {
  return typeof slot?.refresh === 'string' && slot.refresh === stored?.refresh
}

// Match /accounts: capture refreshed slots into their accounts, but never across identities.
export function captureSlots(
  bucket: Bucket,
  auth: Auth,
  options: { strict?: boolean; exclude?: string } = {}
): void {
  for (const [activeProvider, activeName] of Object.entries(bucket.active)) {
    if (activeProvider === options.exclude) {
      continue
    }
    const slot = auth[activeProvider]
    const stored = bucket.accounts[activeProvider]?.[activeName]
    if (!slot || !stored) {
      continue
    }
    if (slot.accountId && stored.accountId && slot.accountId !== stored.accountId) {
      if (options.strict) {
        throw saveFirst(activeProvider)
      }
      continue
    }
    bucket.accounts[activeProvider][activeName] = slot
  }
}
