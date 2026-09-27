import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import {
  hasRemoteProviderAccountOwner,
  selectClaudeProviderAccount,
  selectCodexProviderAccount
} from '@/runtime/runtime-provider-accounts-client'
import type { PiAccount, PiAccountProvider, PiAccountsState } from '../../../../shared/pi-accounts'

export type PiAccountsNotice = {
  kind:
    | 'added'
    | 'duplicate'
    | 'addFailed'
    | 'removeBlocked'
    | 'removeBlockedProject'
    | 'removeBlockedTerminal'
  name?: string
}
export type PiAccountNameError = 'nameTaken' | 'nameInvalid'

export type PiAccountsController = {
  /** Remote runtimes own their own accounts; this desktop must not read or switch them. */
  remote: boolean
  loaded: boolean
  accounts: PiAccount[]
  busy: boolean
  adding: PiAccountProvider | null
  failed: boolean
  mirrorFailed: boolean
  notice: PiAccountsNotice | null
  loginUrl: string | null
  clearNotice: () => void
  isRemoveBlocked: (account: PiAccount) => boolean
  useAccount: (provider: PiAccountProvider, name: string) => Promise<void>
  addAccount: (provider: PiAccountProvider) => Promise<void>
  removeAccount: (account: PiAccount) => Promise<void>
  renameAccount: (account: PiAccount, name: string) => Promise<PiAccountNameError | null>
}

/** Shared Pi account state and IPC for both the settings section and the status-bar menu. */
export function usePiAccounts(provider?: PiAccountProvider): PiAccountsController {
  const settings = useAppStore((s) => s.settings)
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const remote = hasRemoteProviderAccountOwner(settings)
  const [state, setState] = useState<PiAccountsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<PiAccountProvider | null>(null)
  const [failed, setFailed] = useState(false)
  const [mirrorFailed, setMirrorFailed] = useState(false)
  const [notice, setNotice] = useState<PiAccountsNotice | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  useEffect(() => {
    if (remote || !window.api?.piAccounts) {
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

  const accounts = (state?.accounts ?? []).filter(
    (account) => !provider || account.provider === provider
  )

  const useAccount = async (selectedProvider: PiAccountProvider, name: string): Promise<void> => {
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
        await selectClaudeProviderAccount(settings, { accountId: null, runtime: 'host' })
        deselected.push('anthropic')
      }
      if (codexManaged) {
        await selectCodexProviderAccount(settings, { accountId: null, runtime: 'host' })
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

  const addAccount = async (target: PiAccountProvider): Promise<void> => {
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

  const removeAccount = async (target: PiAccount): Promise<void> => {
    setNotice(null)
    try {
      const result = await window.api.piAccounts.remove(target.provider, target.name)
      setState(result.state)
      if (result.status === 'active-in-use') {
        setNotice({ kind: 'removeBlocked' })
      } else if (result.status === 'pinned-to-project') {
        setNotice({ kind: 'removeBlockedProject' })
      } else if (result.status === 'open-in-terminal') {
        setNotice({ kind: 'removeBlockedTerminal' })
      }
    } catch {
      setFailed(true)
    }
  }

  const renameAccount = async (
    target: PiAccount,
    name: string
  ): Promise<PiAccountNameError | null> => {
    try {
      const result = await window.api.piAccounts.rename(target.provider, target.name, name.trim())
      setState(result.state)
      if (result.status === 'renamed') {
        return null
      }
      return result.status === 'name-taken' ? 'nameTaken' : 'nameInvalid'
    } catch {
      return 'nameInvalid'
    }
  }

  return {
    remote,
    loaded: state !== null,
    accounts,
    busy,
    adding,
    failed: failed || state?.error === 'read-failed',
    mirrorFailed,
    notice,
    loginUrl,
    clearNotice: () => setNotice(null),
    // Removing the active account while siblings exist would orphan Pi's auth.json slot.
    isRemoveBlocked: (account) =>
      account.active &&
      (state?.accounts ?? []).some(
        (other) => other.provider === account.provider && other.name !== account.name
      ),
    useAccount,
    addAccount,
    removeAccount,
    renameAccount
  }
}
