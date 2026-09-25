export type PiAccountProvider = 'anthropic' | 'openai-codex'
export type PiAccount = {
  provider: PiAccountProvider
  name: string
  active: boolean
  drift: boolean
}
export type PiAccountsState = { accounts: PiAccount[]; error?: string }
export type PiAccountsApi = {
  list: () => Promise<PiAccountsState>
  use: (provider: PiAccountProvider, name: string) => Promise<PiAccountsState>
  onChange: (callback: (state: PiAccountsState) => void) => () => void
}
