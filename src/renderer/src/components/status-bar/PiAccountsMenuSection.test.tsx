// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getDefaultSettings } from '../../../../shared/constants'
import type { PiAccountsState } from '../../../../shared/pi-accounts'
import { useAppStore } from '../../store'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { PiAccountsMenuSection } from './PiAccountsMenuSection'

vi.mock('@/runtime/runtime-provider-accounts-client', () => ({
  hasRemoteProviderAccountOwner: (settings: { activeRuntimeEnvironmentId?: string }) =>
    Boolean(settings?.activeRuntimeEnvironmentId),
  selectClaudeProviderAccount: vi.fn(async () => {}),
  selectCodexProviderAccount: vi.fn(async () => {})
}))

const initial: PiAccountsState = {
  accounts: [
    { provider: 'anthropic', name: 'biel', active: true, drift: false },
    {
      provider: 'anthropic',
      name: 'a-very-long-account-name@example.com',
      active: false,
      drift: false
    },
    { provider: 'openai-codex', name: 'codex-work', active: true, drift: false }
  ]
}
const list = vi.fn(async () => initial)
const use = vi.fn(async () => initial)
const add = vi.fn(async () => ({ status: 'added' as const, name: 'new', state: initial }))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')

function renderMenu(provider: 'anthropic' | 'openai-codex' = 'anthropic'): void {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuContent className="w-[300px]">
        <PiAccountsMenuSection provider={provider} label="Claude Account" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
        use,
        add,
        remirror: vi.fn(async () => initial),
        remove: vi.fn(),
        rename: vi.fn(),
        cancelAdd: vi.fn(async () => true),
        onChange: () => () => {},
        onLoginUrl: () => () => {}
      }
    }
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  }
})

it('lists only this provider without the provider prefix and keeps long names on one truncated line', async () => {
  renderMenu()
  const long = await screen.findByText('a-very-long-account-name@example.com')
  expect(screen.getByText('biel')).toBeTruthy()
  expect(screen.queryByText('codex-work')).toBeNull()
  expect(screen.queryByText(/anthropic \//)).toBeNull()
  // The reported bug: the name shared a row with Active + Use/Rename/Remove and wrapped per letter.
  expect(long.className).toContain('truncate')
  expect(long.className).toContain('min-w-0')
  expect(long.getAttribute('title')).toBe('a-very-long-account-name@example.com')
})

it('omits the settings-page help paragraphs and the per-row Use/Rename/Remove buttons', async () => {
  renderMenu()
  await screen.findByText('biel')
  expect(screen.queryByText(/For SSH or WSL/)).toBeNull()
  expect(screen.queryByText(/accounts save/)).toBeNull()
  expect(screen.queryByText(/Restart existing Claude or Codex terminals/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Use' })).toBeNull()
  expect(screen.queryByText('Rename')).toBeNull()
  expect(screen.queryByText('Remove')).toBeNull()
})

it('switches by clicking an inactive row and marks the active one', async () => {
  renderMenu()
  const long = await screen.findByText('a-very-long-account-name@example.com')
  const active = screen.getByText('biel').closest('[role="menuitem"]')
  expect(active?.getAttribute('data-disabled')).not.toBeNull()
  expect(screen.getByLabelText('Active')).toBeTruthy()
  fireEvent.click(long)
  await waitFor(() =>
    expect(use).toHaveBeenCalledWith('anthropic', 'a-very-long-account-name@example.com')
  )
})

it('offers adding an account as a plain menu item', async () => {
  renderMenu()
  const item = await screen.findByText('Add Claude account')
  fireEvent.click(item)
  await waitFor(() => expect(add).toHaveBeenCalledWith('anthropic'))
})

it('never reads desktop accounts when the account owner is remote', () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'remote' }
  })
  renderMenu()
  expect(screen.getByText('Switch to the local desktop to manage these accounts.')).toBeTruthy()
  expect(list).not.toHaveBeenCalled()
})
