import { useEffect, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import {
  hasRemoteProviderAccountOwner,
  selectClaudeProviderAccount,
  selectCodexProviderAccount
} from '@/runtime/runtime-provider-accounts-client'
import type { PiAccount, PiAccountProvider, PiAccountsState } from '../../../../shared/pi-accounts'
import { Button } from '../ui/button'
import { LoginLinkNotice } from './LoginLinkNotice'
import { PiAccountRow } from './PiAccountRow'
import { RemovePiAccountDialog, RenamePiAccountDialog } from './pi-account-dialogs'

type Notice = { kind: 'added' | 'duplicate' | 'addFailed' | 'removeBlocked'; name?: string }
type NameError = 'nameTaken' | 'nameInvalid'

function addLabel(provider: PiAccountProvider): string {
  return provider === 'anthropic'
    ? translate('piAccounts.addClaude', 'Add Claude account')
    : translate('piAccounts.addCodex', 'Add Codex account')
}

function noticeText(notice: Notice): string {
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
  }
}

function nameErrorText(error: NameError): string {
  return error === 'nameTaken'
    ? translate('piAccounts.nameTaken', 'That name is already used.')
    : translate('piAccounts.nameInvalid', 'Use letters, numbers and . _ @ + - without spaces.')
}

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
  const [adding, setAdding] = useState<PiAccountProvider | null>(null)
  const [failed, setFailed] = useState(false)
  const [mirrorFailed, setMirrorFailed] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<PiAccount | null>(null)
  const [renameTarget, setRenameTarget] = useState<PiAccount | null>(null)
  const [renameError, setRenameError] = useState<NameError | null>(null)

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
    const stopLoginUrl = window.api.piAccounts.onLoginUrl((url) => {
      if (!disposed) {
        setLoginUrl(url)
      }
    })
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
      stopLoginUrl()
    }
  }, [remote])

  const visible = (state?.accounts ?? []).filter(
    (account) => !provider || account.provider === provider
  )
  // Removing the active account while siblings exist would orphan Pi's auth.json slot.
  const removeBlocked =
    removeTarget !== null &&
    removeTarget.active &&
    (state?.accounts ?? []).some(
      (account) => account.provider === removeTarget.provider && account.name !== removeTarget.name
    )

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
      const next = await window.api.piAccounts.use(selectedProvider, name)
      setState(next)
      setMirrorFailed(next.error === 'mirror-failed')
      // Keep managed-account selection on system default without changing its storage or service.
      // Deselecting restores an Orca snapshot over the mirror, so push the Pi credential back after.
      const claudeManaged =
        settings?.activeClaudeManagedAccountIdsByRuntime?.host ||
        settings?.activeClaudeManagedAccountId
      const codexManaged =
        settings?.activeCodexManagedAccountIdsByRuntime?.host ||
        settings?.activeCodexManagedAccountId
      const deselected: PiAccountProvider[] = []
      if (claudeManaged) {
        await selectClaudeProviderAccount(settings, {
          accountId: null,
          runtime: 'host'
        })
        deselected.push('anthropic')
      }
      if (codexManaged) {
        await selectCodexProviderAccount(settings, {
          accountId: null,
          runtime: 'host'
        })
        deselected.push('openai-codex')
      }
      for (const deselectedProvider of deselected) {
        setState(await window.api.piAccounts.remirror(deselectedProvider))
      }
      await fetchSettings()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (target: PiAccountProvider): Promise<void> => {
    if (busy || adding || remote) {
      return
    }
    setAdding(target)
    setFailed(false)
    setNotice(null)
    try {
      const result = await window.api.piAccounts.add(target)
      setState(result.state)
      if (result.status !== 'cancelled') {
        setNotice({
          kind: result.status === 'failed' ? 'addFailed' : result.status,
          name: result.name
        })
      }
    } catch {
      setFailed(true)
    } finally {
      setAdding(null)
      setLoginUrl(null)
    }
  }

  const handleRemove = async (): Promise<void> => {
    const target = removeTarget
    setRemoveTarget(null)
    if (!target) {
      return
    }
    setNotice(null)
    try {
      const result = await window.api.piAccounts.remove(target.provider, target.name)
      setState(result.state)
      if (result.status === 'active-in-use') {
        setNotice({ kind: 'removeBlocked' })
      }
    } catch {
      setFailed(true)
    }
  }

  const handleRename = async (name: string): Promise<void> => {
    const target = renameTarget
    if (!target) {
      return
    }
    setRenameError(null)
    try {
      const result = await window.api.piAccounts.rename(target.provider, target.name, name.trim())
      setState(result.state)
      if (result.status === 'renamed') {
        setRenameTarget(null)
        return
      }
      setRenameError(result.status === 'name-taken' ? 'nameTaken' : 'nameInvalid')
    } catch {
      setRenameError('nameInvalid')
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
                disabled={busy || adding !== null}
                onClick={() => void handleAdd(target)}
              >
                {adding === target ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                {addLabel(target)}
              </Button>
            ))}
            {adding ? (
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
          {adding ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'piAccounts.signingIn',
                'Finish the sign-in in your browser. ARCA saves the account when it completes.'
              )}
            </p>
          ) : null}
          <LoginLinkNotice url={loginUrl} />
          {visible.map((account) => (
            <PiAccountRow
              key={`${account.provider}/${account.name}`}
              account={account}
              busy={busy || adding !== null}
              onUse={() => void handleUseAccount(account.provider, account.name)}
              onRename={() => {
                setRenameError(null)
                setRenameTarget(account)
              }}
              onRemove={() => setRemoveTarget(account)}
            />
          ))}
          {state && visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.empty', 'No saved Pi accounts.')}
            </p>
          ) : null}
          {!state && !failed ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.loading', 'Loading accounts…')}
            </p>
          ) : null}
          {notice ? <p className="text-xs text-muted-foreground">{noticeText(notice)}</p> : null}
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
          <RemovePiAccountDialog
            target={removeTarget}
            blocked={removeBlocked}
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
