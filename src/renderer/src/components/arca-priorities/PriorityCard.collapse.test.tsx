// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { publishFloatingTerminalTriggerPosition } from '@/components/floating-terminal/floating-terminal-trigger-layout-store'
import { PriorityCard } from './PriorityCard'

const statusChangeListeners = vi.hoisted(() => [] as (() => void)[])

vi.mock('@/components/task-page/status-md-subscription', () => ({
  subscribeStatusMdChanges: (refresh: () => void) => {
    statusChangeListeners.push(refresh)
    return () => {
      statusChangeListeners.splice(statusChangeListeners.indexOf(refresh), 1)
    }
  }
}))

vi.mock('@/store/selectors', () => ({ useActiveWorktree: () => null }))

vi.mock('@/components/task-page/useStatusMdTaskActions', () => ({
  useStatusMdTaskActions: () => ({
    openStatusTask: vi.fn(),
    workWithPi: vi.fn(),
    copyTask: vi.fn()
  })
}))

vi.mock('./usePriorityActions', () => ({
  usePriorityActions: () => ({ openStatus: vi.fn(), work: vi.fn() })
}))

vi.mock('./CurrentProjectPane', () => ({ CurrentProjectPane: () => null }))
vi.mock('./RecentTasksPane', () => ({ RecentTasksPane: () => null }))
vi.mock('./PriorityRow', () => ({ PriorityRow: () => null }))

const project = {
  repoId: 'repo-a',
  projectId: 'project-a',
  name: 'Project A',
  statusPath: '/repo-a/STATUS.md',
  tasks: []
}

function stubApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      arcaPriorities: { list: vi.fn(async () => []), onChange: vi.fn(() => () => {}) },
      statusMdTasks: {
        list: vi.fn(async () => [project]),
        recent: vi.fn(async () => ({ open: [], completed: [] }))
      },
      arcaMegamind: { agents: vi.fn(async () => []) }
    }
  })
}

async function renderCard(): Promise<void> {
  await act(async () => {
    render(
      <TooltipProvider>
        <PriorityCard />
      </TooltipProvider>
    )
  })
}

function launcher(): HTMLElement | null {
  return document.querySelector('[data-arca-priority-launcher]')
}

function launcherFrame(): HTMLElement | null {
  return document.querySelector('[data-arca-priority-card]')
}

function requireElement(element: HTMLElement | null, name: string): HTMLElement {
  if (element === null) {
    throw new Error(`${name} is not rendered`)
  }
  return element
}

describe('PriorityCard collapsed launcher', () => {
  beforeEach(() => {
    statusChangeListeners.length = 0
    localStorage.clear()
    stubApi()
  })

  afterEach(() => {
    cleanup()
    publishFloatingTerminalTriggerPosition(null)
  })

  it('parks the launcher above the dragged floating workspace trigger', async () => {
    localStorage.setItem('arca.priority-card.collapsed', 'true')
    await renderCard()
    await act(async () => {
      publishFloatingTerminalTriggerPosition({ left: 120, top: 400 })
    })
    expect(launcherFrame()?.style.left).toBe('120px')
    expect(launcherFrame()?.style.top).toBe('356px')

    await act(async () => {
      publishFloatingTerminalTriggerPosition({ left: 300, top: 40 })
    })
    expect(launcherFrame()?.style.left).toBe('300px')
    // No room above the trigger, so the launcher stacks below it.
    expect(launcherFrame()?.style.top).toBe('84px')
  })

  it('opens the expanded card beside the button column without covering it', async () => {
    localStorage.setItem('arca.priority-card.collapsed', 'true')
    await renderCard()
    await act(async () => {
      publishFloatingTerminalTriggerPosition({ left: 600, top: 500 })
    })
    await act(async () => {
      fireEvent.click(requireElement(launcher(), 'tasks launcher'))
    })
    const card = requireElement(launcherFrame(), 'tasks card')
    const width = Number.parseFloat(card.style.width)
    expect(Number.parseFloat(card.style.left) + width).toBe(592)
    expect(card.style.bottom).toBe(`${window.innerHeight - 536}px`)
  })

  it('renders a floating launcher button instead of the card when collapsed', async () => {
    localStorage.setItem('arca.priority-card.collapsed', 'true')
    await renderCard()
    expect(launcher()).not.toBeNull()
    expect(launcher()?.getAttribute('aria-label')).toBe(
      translate('auto.components.priorities.launcherLabel', 'Show project tasks')
    )
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('expands to the card on click and collapses back to the launcher', async () => {
    localStorage.setItem('arca.priority-card.collapsed', 'true')
    await renderCard()
    await act(async () => {
      fireEvent.click(launcher() as HTMLElement)
    })
    expect(launcher()).toBeNull()
    expect(screen.getByRole('heading').textContent).toBe(
      translate('auto.components.priorities.cardTitle', 'Project tasks')
    )
    expect(localStorage.getItem('arca.priority-card.collapsed')).toBe('false')

    await act(async () => {
      fireEvent.click(
        screen.getByLabelText(
          translate('auto.components.priorities.collapse', 'Collapse priorities')
        )
      )
    })
    expect(launcher()).not.toBeNull()
    expect(localStorage.getItem('arca.priority-card.collapsed')).toBe('true')
  })

  it('marks the launcher with an attention dot after a task change while collapsed', async () => {
    localStorage.setItem('arca.priority-card.collapsed', 'true')
    await renderCard()
    expect(document.querySelector('[data-floating-launcher-attention]')).toBeNull()
    await act(async () => {
      statusChangeListeners.forEach((listener) => listener())
    })
    expect(document.querySelector('[data-floating-launcher-attention]')).not.toBeNull()
    expect(launcher()?.getAttribute('aria-label')).toBe(
      translate(
        'auto.components.priorities.launcherLabelAttention',
        'Show project tasks, new updates'
      )
    )

    await act(async () => {
      fireEvent.click(launcher() as HTMLElement)
    })
    await act(async () => {
      fireEvent.click(
        screen.getByLabelText(
          translate('auto.components.priorities.collapse', 'Collapse priorities')
        )
      )
    })
    expect(document.querySelector('[data-floating-launcher-attention]')).toBeNull()
  })
})
