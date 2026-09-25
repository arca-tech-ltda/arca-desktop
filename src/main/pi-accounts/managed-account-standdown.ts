import type { PiAccountProvider } from '../../shared/pi-accounts'

type ProviderStandDown = {
  provider: PiAccountProvider
  activeAccountId: string | null
  deselect: () => Promise<unknown>
}

export type ManagedAccountStandDownDeps = {
  providers: ProviderStandDown[]
  remirror: (provider: PiAccountProvider) => Promise<unknown>
  hasActivePiAccount: (provider: PiAccountProvider) => Promise<boolean>
}

/**
 * Orca-managed host accounts left active by an older build re-materialize their own credentials on
 * every poll, undoing Pi's mirror. Deselect them once at startup, then push Pi's active account back
 * over whatever snapshot the deselect restored.
 */
export async function standDownManagedHostAccounts(
  deps: ManagedAccountStandDownDeps
): Promise<PiAccountProvider[]> {
  const stoodDown: PiAccountProvider[] = []
  for (const entry of deps.providers) {
    if (!entry.activeAccountId) {
      continue
    }
    await entry.deselect()
    stoodDown.push(entry.provider)
    if (await deps.hasActivePiAccount(entry.provider)) {
      await deps.remirror(entry.provider)
    }
  }
  return stoodDown
}
