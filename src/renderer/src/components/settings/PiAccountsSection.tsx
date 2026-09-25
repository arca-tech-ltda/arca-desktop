import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import {
  hasRemoteProviderAccountOwner,
  selectClaudeProviderAccount,
  selectCodexProviderAccount
} from '@/runtime/runtime-provider-accounts-client'
import type { PiAccountProvider, PiAccountsState } from '../../../../shared/pi-accounts'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

export function PiAccountsSection({
  provider
}: {
  provider?: PiAccountProvider
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const remote = hasRemoteProviderAccountOwner(settings)
  const [state, setState] = useState<PiAccountsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [mirrorFailed, setMirrorFailed] = useState(false)

  useEffect(() => {
    if (remote || !window.api.piAccounts) {
      return
    }
    let disposed = false
    const update = (next: PiAccountsState): void => {
      if (!disposed) {
        setState(next)
      }
    }
    const stop = window.api.piAccounts.onChange(update)
    void window.api.piAccounts
      .list()
      .then(update)
      .catch(() => {
        if (!disposed) {
          setFailed(true)
        }
      })
    return () => {
      disposed = true
      stop()
    }
  }, [remote])

  const handleUseAccount = async (
    selectedProvider: PiAccountProvider,
    name: string
  ): Promise<void> => {
    if (busy || remote) {
      return
    }
    setBusy(true)
    setFailed(false)
    setMirrorFailed(false)
    try {
      // Keep managed-account selection on system default without changing its storage or service.
      if (
        settings?.activeClaudeManagedAccountIdsByRuntime?.host ||
        settings?.activeClaudeManagedAccountId
      ) {
        await selectClaudeProviderAccount(settings, { accountId: null, runtime: 'host' })
      }
      if (
        settings?.activeCodexManagedAccountIdsByRuntime?.host ||
        settings?.activeCodexManagedAccountId
      ) {
        await selectCodexProviderAccount(settings, { accountId: null, runtime: 'host' })
      }
      const next = await window.api.piAccounts.use(selectedProvider, name)
      setState(next)
      setMirrorFailed(next.error === 'mirror-failed')
      await fetchSettings()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
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
      {remote ? (
        <p className="text-xs text-muted-foreground">
          {translate('piAccounts.remote', 'Switch to the local desktop to manage these accounts.')}
        </p>
      ) : (
        <>
          {!provider ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'piAccounts.add',
                  'To add an account, run /login in Pi, then /accounts save <provider> <name>. Use anthropic for Claude or openai-codex for Codex.'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'piAccounts.default',
                  'Using a Pi account selects system default for Orca managed accounts. Restart existing Claude or Codex terminals after switching.'
                )}
              </p>
            </>
          ) : null}
          {state?.accounts
            .filter((account) => !provider || account.provider === provider)
            .map((account) => (
              <div key={`${account.provider}/${account.name}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-sm">
                  {account.provider} / {account.name}
                </span>
                {account.active ? (
                  <Badge variant="secondary">{translate('piAccounts.active', 'Active')}</Badge>
                ) : null}
                {account.drift ? (
                  <span className="text-xs text-muted-foreground">
                    {translate(
                      'piAccounts.drift',
                      'Slot differs; save a new login before switching.'
                    )}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleUseAccount(account.provider, account.name)}
                >
                  {translate('piAccounts.use', 'Use')}
                </Button>
              </div>
            ))}
          {state &&
          !state.accounts.some((account) => !provider || account.provider === provider) ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.empty', 'No saved Pi accounts.')}
            </p>
          ) : null}
          {!state && !failed ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.loading', 'Loading accounts…')}
            </p>
          ) : null}
          {mirrorFailed ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'piAccounts.mirrorFailed',
                'Pi switched accounts, but the CLI mirror failed. Run /accounts mirror in Pi.'
              )}
            </p>
          ) : null}
          {failed || state?.error === 'read-failed' ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'piAccounts.failed',
                'Could not read or switch Pi accounts. Check the files and run /accounts in Pi; save any new login before switching.'
              )}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
