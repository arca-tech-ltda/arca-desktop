// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { PiAccountProjectsState } from '../../../../shared/pi-account-projects'
import type { PiAccount } from '../../../../shared/pi-accounts'
import type { Repo } from '../../../../shared/repo-types'
import { useAppStore } from '../../store'
import { PiAccountProjectsSlot } from './PiAccountProjectsSlot'

const account: PiAccount = { provider: 'anthropic', name: 'work', active: false, drift: false }
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')

function mountApi(state: PiAccountProjectsState): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      piAccountProjects: {
        get: vi.fn(async () => state),
        set: vi.fn(),
        syncOpenTabs: vi.fn(),
        onChange: () => () => {}
      }
    }
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  }
})

it('lists the projects fixed to the account, by project name', async () => {
  const repo: Repo = {
    id: 'orca',
    displayName: 'Orca',
    path: '/repos/orca',
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git'
  }
  useAppStore.setState({ repos: [repo] })
  mountApi({
    supported: true,
    map: {
      version: 1,
      projects: {
        '/repos/orca': { anthropic: 'work' },
        '/repos/other': { anthropic: 'personal' }
      }
    },
    sessions: []
  })
  render(<PiAccountProjectsSlot account={account} />)
  await screen.findByText('Orca')
  expect(screen.getByText('Projects using this account:')).toBeTruthy()
  expect(screen.queryByText('other')).toBeNull()
})

it('stays hidden when the installed Pi has no per-project account support', async () => {
  mountApi({
    supported: false,
    map: { version: 1, projects: { '/repos/orca': { anthropic: 'work' } } },
    sessions: []
  })
  const { container } = render(<PiAccountProjectsSlot account={account} />)
  await waitFor(() => expect(window.api.piAccountProjects.get).toHaveBeenCalled())
  expect(container.textContent).toBe('')
})
