export type PiAccountProvider = 'anthropic' | 'openai-codex'
export type PiAccount = {
  provider: PiAccountProvider
  name: string
  active: boolean
  drift: boolean
}
export type PiAccountsState = { accounts: PiAccount[]; error?: string }
/** Every mutation answers with the fresh list; credentials never leave the main process. */
export type PiAccountAddResult = {
  status: 'added' | 'duplicate' | 'cancelled' | 'failed'
  /** The saved (or already existing) account name. Login failures carry no detail: CLI output can quote a token. */
  name?: string
  state: PiAccountsState
}
export type PiAccountRemoveResult = {
  status: 'removed' | 'missing' | 'active-in-use' | 'pinned-to-project' | 'open-in-terminal'
  /** Project paths or terminal count behind a `pinned-to-project` / `open-in-terminal` refusal. */
  blockedBy?: { projects?: string[]; terminals?: number }
  state: PiAccountsState
}
export type PiAccountRenameResult = {
  status: 'renamed' | 'missing' | 'name-taken' | 'invalid-name' | 'open-in-terminal'
  /** Terminals behind an `open-in-terminal` refusal. */
  blockedBy?: { terminals?: number }
  state: PiAccountsState
}
export type PiAccountsApi = {
  list: () => Promise<PiAccountsState>
  use: (provider: PiAccountProvider, name: string) => Promise<PiAccountsState>
  remirror: (provider: PiAccountProvider) => Promise<PiAccountsState>
  add: (provider: PiAccountProvider) => Promise<PiAccountAddResult>
  cancelAdd: () => Promise<boolean>
  remove: (provider: PiAccountProvider, name: string) => Promise<PiAccountRemoveResult>
  rename: (provider: PiAccountProvider, from: string, to: string) => Promise<PiAccountRenameResult>
  onChange: (callback: (state: PiAccountsState) => void) => () => void
  onLoginUrl: (callback: (url: string | null) => void) => () => void
}
