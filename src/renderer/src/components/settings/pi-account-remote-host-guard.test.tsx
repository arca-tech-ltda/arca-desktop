// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import type { PiAccountProjectsState } from '../../../../shared/pi-account-projects'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getRepoMainWorktreeId } from '../../../../shared/worktree/id'
import { useAppStore } from '../../store'
import { NewPiWithAccountMenu } from '../tab-bar/NewPiWithAccountMenu'
import { PiAccountProjectSubmenu } from './pi-account-project-menu'

const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const projectsState: PiAccountProjectsState = {
  supported: true,
  map: { version: 1, projects: {} },
  sessions: []
}

function mountApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      piAccountProjects: {
        get: vi.fn(async () => projectsState),
        set: vi.fn(),
        syncOpenTabs: vi.fn(),
        onChange: () => () => {}
      },
      piAccounts: {
        list: vi.fn(async () => ({
          accounts: [{ provider: 'anthropic', name: 'work', active: true, drift: false }]
        })),
        onChange: () => () => {},
        onLoginUrl: () => () => {}
      }
    }
  })
}

function repo(overrides: Partial<Repo>): Repo {
  return {
    id: 'repo-1',
    displayName: 'Repo',
    path: '/repos/one',
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

function mountRepo(target: Repo): string {
  useAppStore.setState({ repos: [target], worktreesByRepo: {}, folderWorkspaces: [] })
  return getRepoMainWorktreeId(target)
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

it('offers "New Pi with account…" on a local workspace only', async () => {
  mountApi()
  const local = mountRepo(repo({}))
  renderInMenu(<NewPiWithAccountMenu worktreeId={local} />)
  await screen.findByText('New Pi with account…')
  cleanup()

  const ssh = mountRepo(repo({ id: 'repo-ssh', connectionId: 'ssh-1' }))
  renderInMenu(<NewPiWithAccountMenu worktreeId={ssh} />)
  expect(screen.queryByText('New Pi with account…')).toBeNull()
  cleanup()

  const wslPath = '\\\\wsl$\\Ubuntu\\home\\bi\\repo'
  const wsl = mountRepo(repo({ id: 'repo-wsl', path: wslPath }))
  const wslWorktree: Worktree = {
    id: wsl,
    repoId: 'repo-wsl',
    displayName: 'repo',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    path: wslPath,
    head: 'HEAD',
    branch: 'main',
    isBare: false,
    isMainWorktree: true
  }
  useAppStore.setState({ worktreesByRepo: { 'repo-wsl': [wslWorktree] } })
  renderInMenu(<NewPiWithAccountMenu worktreeId={wsl} />)
  expect(screen.queryByText('New Pi with account…')).toBeNull()
})

it('hides the project Account submenu for SSH and WSL projects', async () => {
  mountApi()
  renderInMenu(<PiAccountProjectSubmenu projectPath="/repos/one" />)
  await waitFor(() => expect(screen.queryByTestId('pi-account-project-submenu')).not.toBeNull())
  cleanup()

  renderInMenu(<PiAccountProjectSubmenu projectPath="/repos/one" connectionId="ssh-1" />)
  expect(screen.queryByTestId('pi-account-project-submenu')).toBeNull()
  cleanup()

  renderInMenu(<PiAccountProjectSubmenu projectPath={'\\\\wsl$\\Ubuntu\\home\\bi\\repo'} />)
  expect(screen.queryByTestId('pi-account-project-submenu')).toBeNull()
})
