// @vitest-environment happy-dom
/**
 * The status-bar switchers carry both owners: Pi's bucket section on Gabriel's machines and the
 * Orca managed-account runtime toggle on the partners'. These render the real menus in each mode.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import type { AgentAuthorityMode } from '../../../../shared/agent-authority'

const authority = vi.hoisted((): { mode: AgentAuthorityMode } => ({ mode: 'pi' }))

vi.mock('@/store/agent-authority', () => ({
  useAgentAuthorityMode: () => authority.mode
}))

vi.mock('./PiAccountsMenuSection', () => ({
  PiAccountsMenuSection: () => <div data-testid="pi-accounts-section" />
}))

vi.mock('./StatusBarAccountControls', () => ({
  AccountRuntimeToggle: () => <div data-testid="account-runtime-toggle" />
}))

vi.mock('./ProviderDetailsMenu', () => ({
  ProviderDetailsMenu: ({
    children,
    topContent
  }: {
    children?: React.ReactNode
    topContent?: React.ReactNode
  }) => (
    <div>
      {topContent}
      {children}
    </div>
  )
}))

vi.mock('./InlineProviderUsage', () => ({
  InlineUsageBars: () => null,
  InlineUsageSkeleton: () => null
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuSub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({ getActiveRuntimeTarget: () => null }))

vi.mock('@/runtime/runtime-provider-accounts-client', () => ({
  fetchProviderAccountsSnapshot: vi.fn(async () => ({
    codex: {
      accounts: [],
      activeAccountId: null,
      activeAccountIdsByRuntime: { host: null, wsl: {} }
    },
    claude: { accounts: [], activeAccountId: null },
    failedProviders: []
  })),
  selectClaudeProviderAccount: vi.fn(async () => ({ accounts: [], activeAccountId: null })),
  selectCodexProviderAccount: vi.fn(async () => ({
    accounts: [],
    activeAccountId: null,
    activeAccountIdsByRuntime: { host: null, wsl: {} }
  }))
}))

vi.mock('@/lib/windows-terminal-capabilities', () => ({
  useWindowsTerminalCapabilities: () => ({ wslDistros: [], isLoading: false }),
  getWindowsTerminalCapabilityOwnerKey: () => 'local'
}))

const storeState = {
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  fetchSettings: vi.fn(async () => {}),
  recordFeatureInteraction: vi.fn(),
  refreshClaudeRateLimitsForTarget: vi.fn(async () => {}),
  fetchInactiveClaudeAccountUsage: vi.fn(async () => {}),
  runtimeEnvironments: [],
  settings: {
    claudeManagedAccounts: [],
    activeClaudeManagedAccountId: null,
    localAccountRuntime: 'host',
    localAccountWslDistro: null
  },
  rateLimits: { inactiveClaudeAccounts: {}, claudeTarget: null }
}

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))

const claude: ProviderRateLimits = {
  provider: 'claude',
  session: null,
  weekly: null,
  updatedAt: 1,
  error: null,
  status: 'ok'
}

beforeEach(() => {
  authority.mode = 'pi'
})

afterEach(() => {
  cleanup()
})

async function renderClaudeSwitcher(mode: AgentAuthorityMode): Promise<void> {
  authority.mode = mode
  const { ClaudeSwitcherMenu } = await import('./ClaudeSwitcherMenu')
  render(<ClaudeSwitcherMenu claude={claude} compact={false} iconOnly={false} />)
}

it('keeps the Pi bucket section and hides the managed runtime toggle in pi authority', async () => {
  await renderClaudeSwitcher('pi')

  expect(screen.getByTestId('pi-accounts-section')).toBeTruthy()
  expect(screen.queryByTestId('account-runtime-toggle')).toBeNull()
})

it('restores the Orca managed account controls in managed authority', async () => {
  await renderClaudeSwitcher('managed')

  expect(screen.queryByTestId('pi-accounts-section')).toBeNull()
  expect(screen.getByTestId('account-runtime-toggle')).toBeTruthy()
})
