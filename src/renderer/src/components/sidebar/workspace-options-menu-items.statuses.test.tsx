// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = {
  repos: [],
  projectGroups: [],
  settings: {},
  sortBy: 'smart',
  setSortBy: vi.fn(),
  groupBy: 'repo',
  setGroupBy: vi.fn(),
  projectOrderBy: 'manual',
  setProjectOrderBy: vi.fn(),
  visibleWorkspaceHostIds: null,
  setVisibleWorkspaceHostIds: vi.fn(),
  setWorkspaceHostScope: vi.fn(),
  worktreeCardProperties: [],
  setWorktreeCardProperties: vi.fn(),
  agentActivityDisplayMode: 'compact',
  setAgentActivityDisplayMode: vi.fn(),
  setWorktreeCardMode: vi.fn(),
  workspaceStatuses: [
    { id: 'todo', label: 'Todo' },
    { id: 'doing', label: 'Doing' }
  ],
  setWorkspaceStatuses: vi.fn(),
  updateWorktreeMeta: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (snapshot: typeof state) => unknown) => selector(state)
}))

vi.mock('@/store/selectors', () => ({ useAllWorktrees: () => [] }))

vi.mock('./use-sidebar-host-scope-options', () => ({
  useSidebarHostScopeOptions: () => ({ hostOptions: [] })
}))

vi.mock('./SidebarWorkspaceFilterSection', () => ({ default: () => null }))
vi.mock('./SidebarRepositoryFilterSection', () => ({ default: () => null }))
vi.mock('./SidebarGroupByToggle', () => ({ SidebarGroupByToggle: () => null }))
vi.mock('./WorktreeCardDisplayMenuSection', () => ({
  WorktreeCardDisplayMenuSection: () => null
}))

// Render menu scaffolding inline: this test is about the statuses editor being
// reachable from the workspace options menu, not about Radix submenu mechanics.
vi.mock('@/components/ui/dropdown-menu', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    DropdownMenuLabel: passthrough,
    DropdownMenuRadioGroup: passthrough,
    DropdownMenuRadioItem: passthrough,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: passthrough,
    DropdownMenuSubContent: passthrough,
    DropdownMenuSubTrigger: passthrough
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: () => null
}))

import { WorkspaceOptionsMenuItems } from './workspace-options-menu-items'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
})

describe('workspace options menu statuses section', () => {
  it('offers the status editor for every configured status', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root?.render(<WorkspaceOptionsMenuItems />)
    })

    expect(container.textContent).toContain('Statuses')
    expect(container.querySelector('input[aria-label="Rename Todo"]')).not.toBeNull()
    expect(container.querySelector('input[aria-label="Rename Doing"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Remove Doing"]')).not.toBeNull()

    const addStatus = [...container.querySelectorAll('button')].find(
      (node) => node.textContent?.trim() === 'Add status'
    )
    act(() => addStatus?.click())

    expect(state.setWorkspaceStatuses).toHaveBeenCalledWith([
      { id: 'todo', label: 'Todo' },
      { id: 'doing', label: 'Doing' },
      { id: 'status-3', label: 'Status 3' }
    ])
  })
})
