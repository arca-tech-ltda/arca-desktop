// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { getDefaultSettings } from '../../../../shared/constants'
import type { PiAccountsState } from '../../../../shared/pi-accounts'
import { useAppStore } from '../../store'
import {
  selectClaudeProviderAccount,
  selectCodexProviderAccount
} from '@/runtime/runtime-provider-accounts-client'
import { PiAccountsSection } from './PiAccountsSection'

const order: string[] = []
vi.mock('@/runtime/runtime-provider-accounts-client', () => ({
  hasRemoteProviderAccountOwner: (settings: { activeRuntimeEnvironmentId?: string }) =>
    Boolean(settings?.activeRuntimeEnvironmentId),
  selectClaudeProviderAccount: vi.fn(async () => void order.push('deselect-claude')),
  selectCodexProviderAccount: vi.fn(async () => void order.push('deselect-codex'))
}))

const initial: PiAccountsState = {
  accounts: [
    { provider: 'anthropic', name: 'work', active: true, drift: false },
    { provider: 'anthropic', name: 'personal', active: false, drift: false }
  ]
}
let receive: (state: PiAccountsState) => void
const stop = vi.fn()
const list = vi.fn(async () => initial)
const select = vi.fn(async () => {
  order.push('use')
  return initial
})
const remirror = vi.fn(async () => {
  order.push('remirror')
  return initial
})
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')

beforeEach(() => {
  useAppStore.setState({
    settings: getDefaultSettings('/tmp'),
    fetchSettings: vi.fn(async () => {})
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      piAccounts: {
        list,
        use: select,
        remirror,
        onChange: (callback: typeof receive) => {
          receive = callback
          return stop
        }
      }
    }
  })
})
afterEach(() => {
  cleanup()
  order.length = 0
  vi.clearAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  }
})

it('lists the bucket, switches through IPC, and reacts to external changes', async () => {
  render(<PiAccountsSection />)
  await screen.findByText('anthropic / personal')
  expect(screen.getByText('Active')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[1])
  await waitFor(() => expect(select).toHaveBeenCalledWith('anthropic', 'personal'))
  await act(async () =>
    receive({ accounts: [{ provider: 'anthropic', name: 'external', active: true, drift: true }] })
  )
  expect(screen.getByText('anthropic / external')).toBeTruthy()
  expect(screen.getByText('Pi refreshed this token; Use syncs it.')).toBeTruthy()
})

it('switches Pi first, then stands managed accounts down and re-mirrors Pi over the restored snapshot', async () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), activeClaudeManagedAccountId: 'managed-1' },
    fetchSettings: vi.fn(async () => {})
  })
  render(<PiAccountsSection />)
  await screen.findByText('anthropic / personal')
  fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[1])
  await waitFor(() => expect(remirror).toHaveBeenCalledWith('anthropic'))
  expect(order).toEqual(['use', 'deselect-claude', 'remirror'])
  expect(selectClaudeProviderAccount).toHaveBeenCalledTimes(1)
  expect(selectCodexProviderAccount).not.toHaveBeenCalled()
})

it('never reads or switches desktop accounts when the account owner is remote', () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'remote' }
  })
  render(<PiAccountsSection />)
  expect(screen.getByText('Switch to the local desktop to manage these accounts.')).toBeTruthy()
  expect(list).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
})
