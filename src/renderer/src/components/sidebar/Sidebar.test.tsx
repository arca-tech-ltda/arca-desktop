// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tmpdir } from 'node:os'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { state }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/useSidebarResize', () => ({
  useSidebarResize: () => ({
    containerRef: { current: null },
    isResizing: false,
    onResizeStart: vi.fn()
  })
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./SidebarHeader', () => ({ default: () => <div data-testid="sidebar-header" /> }))

vi.mock('./SidebarAgentsList', () => ({
  default: ({ query }: { query: string }) => (
    <div data-testid="sidebar-agents-list" data-query={query} />
  )
}))

vi.mock('./SidebarNav', () => ({
  default: () => <div data-testid="sidebar-nav" />
}))

vi.mock('./SetupScriptPromptCard', () => ({
  default: () => <div data-testid="setup-script-prompt-card" />
}))

vi.mock('./WorktreeList', () => ({
  default: () => <div data-testid="worktree-list" />
}))

vi.mock('../arca-projects/ArcaSyncMissing', () => ({ ArcaSyncMissing: () => null }))
vi.mock('../arca-projects/ArcaSyncProgress', () => ({ ArcaSyncProgress: () => null }))

vi.mock('./SidebarToolbar', () => ({
  default: () => <div data-testid="sidebar-toolbar" />
}))

vi.mock('./useSidebarProjectDrop', () => ({
  useSidebarProjectDrop: () => ({
    nativeDropTarget: undefined,
    dropHandlers: {},
    affordance: { visible: false }
  })
}))

import Sidebar from './index'

function setSidebarState(settings: GlobalSettings, statusBarVisible = true): void {
  mocks.state = {
    activeModal: null,
    agentDashboardDrawerOpen: false,
    setAgentDashboardDrawerOpen: vi.fn(),
    fetchAllWorktrees: vi.fn(),
    repos: [],
    setSidebarWidth: vi.fn(),
    settings,
    sidebarOpen: true,
    sidebarWidth: 320,
    statusBarVisible
  }
}

function renderSidebar(): string {
  return renderToStaticMarkup(
    <Sidebar worktreeScrollOffsetRef={{ current: 0 }} worktreeScrollAnchorRef={{ current: null }} />
  )
}

function sidebarElement(): ReactNode {
  return (
    <Sidebar worktreeScrollOffsetRef={{ current: 0 }} worktreeScrollAnchorRef={{ current: null }} />
  )
}

afterEach(cleanup)

describe('Sidebar', () => {
  it('anchors the setup script popup to the bottom toolbar', () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    const view = render(sidebarElement())
    const prompt = view.getByTestId('setup-script-prompt-card')
    const toolbar = view.getByTestId('sidebar-toolbar')

    expect(prompt.parentElement).toBe(toolbar.parentElement)
    expect(prompt.parentElement?.classList.contains('relative')).toBe(true)
    expect(prompt.parentElement?.classList.contains('shrink-0')).toBe(true)
  })

  it('applies left sidebar appearance variables to the workspace sidebar surface', () => {
    setSidebarState({
      ...getDefaultSettings(tmpdir()),
      leftSidebarAppearanceMode: 'match-terminal',
      terminalColorOverrides: {
        background: '#101820',
        foreground: '#f0f4f8'
      }
    })

    const markup = renderSidebar()

    expect(markup).toContain('--worktree-sidebar:#101820')
    expect(markup).toContain('--worktree-sidebar-foreground:#f0f4f8')
  })

  it('does not start a full worktree scan while the startup session is hydrating', () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    const fetchAllWorktrees = vi.fn().mockResolvedValue(undefined)
    mocks.state = {
      ...mocks.state,
      fetchAllWorktrees,
      repos: [],
      startupWorktreeRefreshCompleted: false
    }
    const view = render(sidebarElement())

    mocks.state = { ...mocks.state, repos: [{ id: 'repo-a' }] }
    view.rerender(sidebarElement())
    expect(fetchAllWorktrees).not.toHaveBeenCalled()

    mocks.state = { ...mocks.state, startupWorktreeRefreshCompleted: true }
    view.rerender(sidebarElement())
    expect(fetchAllWorktrees).not.toHaveBeenCalled()

    mocks.state = { ...mocks.state, repos: [{ id: 'repo-a' }, { id: 'repo-b' }] }
    view.rerender(sidebarElement())
    expect(fetchAllWorktrees).toHaveBeenCalledTimes(1)
  })

  it('does not scan all hosts when runtime connection status flaps', () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    const fetchAllWorktrees = vi.fn().mockResolvedValue(undefined)
    mocks.state = {
      ...mocks.state,
      fetchAllWorktrees,
      runtimeStatusByEnvironmentId: new Map(),
      startupWorktreeRefreshCompleted: true
    }
    const view = render(sidebarElement())

    for (let index = 0; index < 5; index += 1) {
      mocks.state = {
        ...mocks.state,
        runtimeStatusByEnvironmentId: new Map([
          ['runtime-a', { status: index % 2 === 0 ? 'connected' : null }]
        ])
      }
      view.rerender(sidebarElement())
    }

    expect(fetchAllWorktrees).not.toHaveBeenCalled()
  })

  it('closes the dashboard drawer when the dashboard experiment is disabled', async () => {
    setSidebarState({
      ...getDefaultSettings(tmpdir()),
      experimentalAgentDashboardPopout: false
    })
    const setAgentDashboardDrawerOpen = vi.fn()
    mocks.state = {
      ...mocks.state,
      agentDashboardDrawerOpen: true,
      setAgentDashboardDrawerOpen
    }

    render(sidebarElement())

    await waitFor(() => expect(setAgentDashboardDrawerOpen).toHaveBeenCalledWith(false))
  })
})
