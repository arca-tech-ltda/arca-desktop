// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceStatusDefinition } from '../../../../shared/worktree/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setWorkspaceStatuses = vi.fn()
const updateWorktreeMeta = vi.fn()

let workspaceStatuses: WorkspaceStatusDefinition[] = []
let allWorktrees: { id: string; workspaceStatus?: string }[] = []

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ workspaceStatuses, setWorkspaceStatuses, updateWorktreeMeta })
}))

vi.mock('@/store/selectors', () => ({
  useAllWorktrees: () => allWorktrees
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

// Why inline: the appearance popover portals in the real app; rendering its
// content inline lets this test exercise the color/icon writes it owns.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import WorkspaceStatusListEditor from './WorkspaceStatusListEditor'

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<WorkspaceStatusListEditor />)
  })
}

function button(label: string): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) {
    throw new Error(`Missing button: ${label}`)
  }
  return found
}

beforeEach(() => {
  workspaceStatuses = [
    { id: 'todo', label: 'Todo' },
    { id: 'doing', label: 'Doing' }
  ]
  allWorktrees = []
  setWorkspaceStatuses.mockClear()
  updateWorktreeMeta.mockClear()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
})

describe('WorkspaceStatusListEditor', () => {
  it('renames a status on blur, trimming the typed label', () => {
    render()

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="Rename Todo"]')
    expect(input).not.toBeNull()
    act(() => {
      input!.value = '  Backlog  '
      // Why focusout: React maps onBlur to the bubbling focusout event.
      input!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(setWorkspaceStatuses).toHaveBeenCalledWith([
      { id: 'todo', label: 'Backlog' },
      { id: 'doing', label: 'Doing' }
    ])
  })

  it('adds a status and reorders existing ones', () => {
    render()

    const addStatus = [...(container?.querySelectorAll('button') ?? [])].find(
      (node) => node.textContent?.trim() === 'Add status'
    )
    act(() => addStatus?.click())
    expect(setWorkspaceStatuses).toHaveBeenCalledWith([
      { id: 'todo', label: 'Todo' },
      { id: 'doing', label: 'Doing' },
      { id: 'status-3', label: 'Status 3' }
    ])

    setWorkspaceStatuses.mockClear()
    act(() => button('Move Doing up').click())
    expect(setWorkspaceStatuses).toHaveBeenCalledWith([
      { id: 'doing', label: 'Doing' },
      { id: 'todo', label: 'Todo' }
    ])

    expect(button('Move Todo up').disabled).toBe(true)
    expect(button('Move Doing down').disabled).toBe(true)
  })

  it('changes the color of a status', () => {
    render()

    act(() => button('Set Todo color to Blue').click())

    expect(setWorkspaceStatuses).toHaveBeenCalledWith([
      { id: 'todo', label: 'Todo', color: 'blue' },
      { id: 'doing', label: 'Doing' }
    ])
  })

  it('removes a status and moves its workspaces to the surviving one', () => {
    allWorktrees = [
      { id: 'wt-1', workspaceStatus: 'doing' },
      { id: 'wt-2', workspaceStatus: 'todo' }
    ]
    render()

    act(() => button('Remove Doing').click())

    expect(setWorkspaceStatuses).toHaveBeenCalledWith([{ id: 'todo', label: 'Todo' }])
    expect(updateWorktreeMeta).toHaveBeenCalledTimes(1)
    expect(updateWorktreeMeta).toHaveBeenCalledWith(
      'wt-1',
      { workspaceStatus: 'todo' },
      { executionHostId: 'local' }
    )
  })

  it('keeps the last status undeletable', () => {
    workspaceStatuses = [{ id: 'todo', label: 'Todo' }]
    render()

    expect(button('Remove Todo').disabled).toBe(true)
  })
})
