import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { PiAccount, PiAccountProvider } from '../../../../shared/pi-accounts'
import { Button } from '../ui/button'
import { LoginLinkNotice } from './LoginLinkNotice'
import { PiAccountRow } from './PiAccountRow'
import { RemovePiAccountDialog, RenamePiAccountDialog } from './pi-account-dialogs'
import { usePiAccounts, type PiAccountNameError, type PiAccountsNotice } from './use-pi-accounts'

export function piAccountAddLabel(provider: PiAccountProvider): string {
  return provider === 'anthropic'
    ? translate('piAccounts.addClaude', 'Add Claude account')
    : translate('piAccounts.addCodex', 'Add Codex account')
}

export function piAccountNoticeText(notice: PiAccountsNotice): string {
  switch (notice.kind) {
    case 'added':
      return translate('piAccounts.added', 'Saved as {{value0}}.', { value0: notice.name ?? '' })
    case 'duplicate':
      return translate('piAccounts.duplicate', 'That account is already saved as {{value0}}.', {
        value0: notice.name ?? ''
      })
    case 'addFailed':
      return translate('piAccounts.addFailed', 'Sign-in did not finish. Try again.')
    case 'removeBlocked':
      return translate(
        'piAccounts.removeBlocked',
        'This account is in use. Choose another account with Use first, then remove this one.'
      )
    case 'removeBlockedProject':
      return translate(
        'piAccounts.removeBlockedProject',
        'This account is fixed for a project. Set that project back to the active account first.'
      )
    case 'removeBlockedTerminal':
      return translate(
        'piAccounts.removeBlockedTerminal',
        'This account is running in an open terminal. Close it first, then remove the account.'
      )
  }
}

function nameErrorText(error: PiAccountNameError): string {
  return error === 'nameTaken'
    ? translate('piAccounts.nameTaken', 'That name is already used.')
    : translate('piAccounts.nameInvalid', 'Use letters, numbers and . _ @ + - without spaces.')
}

export function PiAccountsSection({
  provider
}: {
  provider?: PiAccountProvider
}): React.JSX.Element {
  const pi = usePiAccounts(provider)
  const [removeTarget, setRemoveTarget] = useState<PiAccount | null>(null)
  const [renameTarget, setRenameTarget] = useState<PiAccount | null>(null)
  const [renameError, setRenameError] = useState<PiAccountNameError | null>(null)

  const handleRemove = async (): Promise<void> => {
    const target = removeTarget
    setRemoveTarget(null)
    if (target) {
      await pi.removeAccount(target)
    }
  }

  const handleRename = async (name: string): Promise<void> => {
    if (!renameTarget) {
      return
    }
    setRenameError(null)
    const error = await pi.renameAccount(renameTarget, name)
    if (error) {
      setRenameError(error)
      return
    }
    setRenameTarget(null)
  }

  return (
    <section id={provider ? undefined : 'accounts-pi'} className="space-y-3">
      <h3 className="text-sm font-semibold">{translate('piAccounts.title', 'Pi accounts')}</h3>
      <p className="text-xs text-muted-foreground">
        {translate(
          'piAccounts.scope',
          'Local desktop accounts. For SSH or WSL, use /accounts on that host.'
        )}
      </p>
      {pi.remote ? (
        <p className="text-xs text-muted-foreground">
          {translate('piAccounts.remote', 'Switch to the local desktop to manage these accounts.')}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {translate(
              'piAccounts.add',
              'Sign in here to add an account; Pi and the Claude and Codex CLIs then use it. You can also save one from Pi with /accounts save <provider> <name>.'
            )}
          </p>
          {!provider ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'piAccounts.default',
                'Using a Pi account selects system default for Orca managed accounts. Restart existing Claude or Codex terminals after switching.'
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {(provider ? [provider] : (['anthropic', 'openai-codex'] as const)).map((target) => (
              <Button
                key={target}
                size="sm"
                variant="outline"
                disabled={pi.busy || pi.adding !== null}
                onClick={() => void pi.addAccount(target)}
              >
                {pi.adding === target ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                {piAccountAddLabel(target)}
              </Button>
            ))}
            {pi.adding ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void window.api.piAccounts.cancelAdd()}
              >
                <X className="size-3" />
                {translate('piAccounts.cancel', 'Cancel')}
              </Button>
            ) : null}
          </div>
          {pi.adding ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'piAccounts.signingIn',
                'Finish the sign-in in your browser. ARCA saves the account when it completes.'
              )}
            </p>
          ) : null}
          <LoginLinkNotice url={pi.loginUrl} />
          {pi.accounts.map((account) => (
            <PiAccountRow
              key={`${account.provider}/${account.name}`}
              account={account}
              busy={pi.busy || pi.adding !== null}
              onUse={() => void pi.useAccount(account.provider, account.name)}
              onRename={() => {
                setRenameError(null)
                setRenameTarget(account)
              }}
              onRemove={() => setRemoveTarget(account)}
            />
          ))}
          {pi.loaded && pi.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.empty', 'No saved Pi accounts.')}
            </p>
          ) : null}
          {!pi.loaded && !pi.failed ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.loading', 'Loading accounts…')}
            </p>
          ) : null}
          {pi.notice ? (
            <p className="text-xs text-muted-foreground">{piAccountNoticeText(pi.notice)}</p>
          ) : null}
          {pi.mirrorFailed ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'piAccounts.mirrorFailed',
                'Pi switched accounts, but the CLI mirror failed. Run /accounts mirror in Pi.'
              )}
            </p>
          ) : null}
          {pi.failed ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'piAccounts.failed',
                'Could not read or switch Pi accounts. Check the files and run /accounts in Pi; save any new login before switching.'
              )}
            </p>
          ) : null}
          <RemovePiAccountDialog
            target={removeTarget}
            blocked={removeTarget !== null && pi.isRemoveBlocked(removeTarget)}
            onCancel={() => setRemoveTarget(null)}
            onConfirm={() => void handleRemove()}
          />
          <RenamePiAccountDialog
            target={renameTarget}
            error={renameError ? nameErrorText(renameError) : null}
            onCancel={() => setRenameTarget(null)}
            onConfirm={(name) => void handleRename(name)}
          />
        </>
      )}
    </section>
  )
}
