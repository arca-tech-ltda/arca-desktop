// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ManagedAccountProjectsState } from '../../../../shared/managed-account-projects'
import { getRepoMainWorktreeId } from '../../../../shared/worktree/id'
import type { Repo } from '../../../../shared/repo-types'
import { useAppStore } from '../../store'
import { setAgentAuthorityForTest } from '@/store/agent-authority'
import { NewAgentWithAccountMenu } from '../tab-bar/NewAgentWithAccountMenu'
import { ProjectAccountTabBadge } from '../tab-bar/ProjectAccountTabBadge'
import { ProjectAccountBadge } from './ProjectAccountBadge'
import { ProjectAccountSubmenu } from './project-account-menu'

const originalApi = Object.getOwnPropertyDescriptor(window, 'api')

const managedState: ManagedAccountProjectsState = {
  supported: true,
  map: { version: 1, projects: { '/repos/one': { claude: 'claude-1' } } },
  sessions: [{ tabId: 'tab-1', agent: 'codex', accountId: 'codex-1', label: 'codex@arca.com' }],
  accounts: [
    { agent: 'claude', id: 'claude-1', label: 'work@arca.com' },
    { agent: 'codex', id: 'codex-1', label: 'codex@arca.com' }
  ]
}

function mountApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      managedAccountProjects: {
        get: vi.fn(async () => managedState),
        set: vi.fn(async () => ({ status: 'saved', state: managedState })),
        syncOpenTabs: vi.fn(),
        onChange: () => () => {}
      },
      piAccountProjects: {
        get: vi.fn(async () => {
          throw new Error('pi surfaces are unregistered in managed authority')
        }),
        set: vi.fn(),
        syncOpenTabs: vi.fn(),
        onChange: () => () => {}
      }
    }
  })
}

function mountRepo(): string {
  const repo: Repo = {
    id: 'repo-1',
    displayName: 'Repo',
    path: '/repos/one',
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git'
  }
  useAppStore.setState({ repos: [repo], worktreesByRepo: {}, folderWorkspaces: [] })
  return getRepoMainWorktreeId(repo)
}

function renderInMenu(node: React.ReactNode): void {
  render(
    <DropdownMenu open>
      <DropdownMenuContent>{node}</DropdownMenuContent>
    </DropdownMenu>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  }
})

it('offers the managed Claude and Codex accounts in the project Account submenu', async () => {
  setAgentAuthorityForTest({ mode: 'managed', preference: 'auto', resolved: true })
  mountApi()
  renderInMenu(<ProjectAccountSubmenu projectPath="/repos/one" />)

  await waitFor(() => expect(screen.queryByTestId('pi-account-project-submenu')).not.toBeNull())
  // The managed map answers this submenu; the Pi bridge is unregistered in this mode.
  expect(window.api.managedAccountProjects.get).toHaveBeenCalled()
  expect(window.api.piAccountProjects.get).not.toHaveBeenCalled()
})

it('offers one "New … with account…" entry per managed agent', async () => {
  setAgentAuthorityForTest({ mode: 'managed', preference: 'auto', resolved: true })
  mountApi()
  renderInMenu(<NewAgentWithAccountMenu worktreeId={mountRepo()} />)

  await waitFor(() => expect(screen.queryByText('New Claude with account…')).not.toBeNull())
  expect(screen.getByText('New Codex with account…')).toBeTruthy()
  expect(screen.queryByText('New Pi with account…')).toBeNull()
})

it('badges the project and the tab with the managed account e-mail', async () => {
  setAgentAuthorityForTest({ mode: 'managed', preference: 'auto', resolved: true })
  mountApi()
  render(
    <TooltipProvider>
      <ProjectAccountBadge projectPath="/repos/one" />
      <ProjectAccountTabBadge tabId="tab-1" />
    </TooltipProvider>
  )

  await waitFor(() => expect(screen.queryByTestId('pi-account-project-badge')).not.toBeNull())
  expect(screen.getByTestId('pi-account-project-badge').textContent).toBe('work@arca.com')
  expect(screen.getByTestId('pi-account-tab-badge').textContent).toBe('codex@arca.com')
})

it('shows no managed surface while the machine is in pi authority', async () => {
  setAgentAuthorityForTest({ mode: 'pi', preference: 'auto', resolved: true })
  mountApi()
  renderInMenu(<NewAgentWithAccountMenu worktreeId={mountRepo()} />)

  await waitFor(() => expect(screen.queryByText('New Pi with account…')).not.toBeNull())
  expect(screen.queryByText('New Claude with account…')).toBeNull()
  expect(window.api.managedAccountProjects.get).not.toHaveBeenCalled()
})
