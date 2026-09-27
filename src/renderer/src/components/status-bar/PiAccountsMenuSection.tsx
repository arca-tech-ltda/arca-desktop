import { Check, Loader2, Plus, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import type { PiAccountProvider } from '../../../../shared/pi-accounts'
import { piAccountAddLabel, piAccountNoticeText } from '../settings/PiAccountsSection'
import { usePiAccounts } from '../settings/use-pi-accounts'

/**
 * Compact Pi account switcher for the ~300px status-bar popover: provider-scoped rows without the
 * `provider /` prefix or the settings page's help paragraphs. Rename/remove stay in Settings.
 */
export function PiAccountsMenuSection({
  provider,
  label
}: {
  provider: PiAccountProvider
  label: string
}): React.JSX.Element {
  const pi = usePiAccounts(provider)

  if (pi.remote) {
    return (
      <>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-[11px] leading-4 text-muted-foreground">
          {translate('piAccounts.remote', 'Switch to the local desktop to manage these accounts.')}
        </div>
      </>
    )
  }

  return (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {pi.accounts.map((account) => (
        <DropdownMenuItem
          key={account.name}
          disabled={pi.busy || pi.adding !== null || account.active}
          onSelect={(event) => {
            event.preventDefault()
            if (!account.active) {
              void pi.useAccount(account.provider, account.name)
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate" title={account.name}>
            {account.name}
          </span>
          {account.active ? (
            <Check
              className="ml-auto shrink-0"
              aria-label={translate('piAccounts.active', 'Active')}
            />
          ) : null}
        </DropdownMenuItem>
      ))}
      {pi.loaded && pi.accounts.length === 0 ? (
        <div className="px-2 py-1 text-[11px] text-muted-foreground">
          {translate('piAccounts.empty', 'No saved Pi accounts.')}
        </div>
      ) : null}
      {!pi.loaded && !pi.failed ? (
        <div className="px-2 py-1 text-[11px] text-muted-foreground">
          {translate('piAccounts.loading', 'Loading accounts…')}
        </div>
      ) : null}
      <DropdownMenuItem
        disabled={pi.busy || pi.adding !== null}
        onSelect={(event) => {
          event.preventDefault()
          void pi.addAccount(provider)
        }}
      >
        {pi.adding === provider ? <Loader2 className="animate-spin" /> : <Plus />}
        <span className="min-w-0 flex-1 truncate">{piAccountAddLabel(provider)}</span>
      </DropdownMenuItem>
      {pi.adding ? (
        <>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void window.api.piAccounts.cancelAdd()
            }}
          >
            <X />
            {translate('piAccounts.cancel', 'Cancel')}
          </DropdownMenuItem>
          <div className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">
            {translate(
              'piAccounts.signingIn',
              'Finish the sign-in in your browser. ARCA saves the account when it completes.'
            )}
          </div>
        </>
      ) : null}
      {pi.notice ? (
        <div className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">
          {piAccountNoticeText(pi.notice)}
        </div>
      ) : null}
      {pi.mirrorFailed || pi.failed ? (
        <div role="alert" className="px-2 py-1 text-[11px] leading-4 text-destructive">
          {pi.mirrorFailed
            ? translate(
                'piAccounts.mirrorFailed',
                'Pi switched accounts, but the CLI mirror failed. Run /accounts mirror in Pi.'
              )
            : translate(
                'piAccounts.failed',
                'Could not read or switch Pi accounts. Check the files and run /accounts in Pi; save any new login before switching.'
              )}
        </div>
      ) : null}
    </>
  )
}
