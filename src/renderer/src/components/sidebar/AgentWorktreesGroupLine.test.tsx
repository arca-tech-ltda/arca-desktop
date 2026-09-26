// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DetectedWorktree } from '../../../../shared/worktree/types'
import type { AgentWorktreeInspection } from './agent-worktree-inspection'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(values?.[name] ?? ''))
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

function agentWorktree(overrides: Partial<DetectedWorktree> = {}): DetectedWorktree {
  return {
    id: `repo::${overrides.path ?? '/tmp/arca-notif-wt'}`,
    repoId: 'repo',
    path: '/tmp/arca-notif-wt',
    displayName: 'arca-notif-wt',
    branch: 'refs/heads/arca-notif',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    ownership: 'external',
    selectedCheckout: false,
    visible: false,
    agentWork: { source: 'temp-dir' },
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

const TWO_AGENT_WORKTREES = [
  agentWorktree({
    agentWork: { source: 'marker', agent: 'claude', task: 'Wire notifications' }
  }),
  agentWorktree({
    id: 'repo::/tmp/arca-ui-wt',
    path: '/tmp/arca-ui-wt',
    displayName: 'arca-ui-wt',
    branch: 'refs/heads/arca-ui'
  })
]

type GroupProps = {
  agentWorktrees?: readonly DetectedWorktree[]
  inspections?: Map<string, AgentWorktreeInspection>
  onRemove?: (worktree: DetectedWorktree, force: boolean) => void
  confirmingWorktreeId?: string | null
}

async function renderGroup(props: GroupProps = {}): Promise<void> {
  const { default: AgentWorktreesGroupLine } = await import('./AgentWorktreesGroupLine')
  const { TooltipProvider } = await import('@/components/ui/tooltip')
  await act(async () =>
    root.render(
      <TooltipProvider>
        <AgentWorktreesGroupLine
          repoDisplayName="arca-desktop"
          agentWorktrees={props.agentWorktrees ?? TWO_AGENT_WORKTREES}
          inspections={props.inspections ?? new Map()}
          busyWorktreeId={null}
          confirmingWorktreeId={props.confirmingWorktreeId ?? null}
          confirmReason={props.confirmingWorktreeId ? 'unsaved-work' : null}
          error={null}
          onOpen={vi.fn()}
          onReviewDiff={vi.fn()}
          onRemove={props.onRemove ?? vi.fn()}
          onCancelConfirm={vi.fn()}
        />
      </TooltipProvider>
    )
  )
}

function queryButtonByText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text
  )
}

async function expandGroup(): Promise<void> {
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]')
  await act(async () => toggle?.click())
}

describe('AgentWorktreesGroupLine', () => {
  it('renders a collapsed agent count instead of a discovery prompt', async () => {
    await renderGroup()

    expect(container.textContent).toContain('2 agents working')
    expect(container.textContent).not.toContain('Keep hidden')
    expect(container.textContent).not.toContain('Show in worktree list')
    expect(container.querySelector('button[aria-expanded="false"]')).not.toBeNull()
  })

  it('renders nothing when no worktree is an agent worktree', async () => {
    await renderGroup({ agentWorktrees: [] })

    expect(container.textContent).toBe('')
  })

  it('expands into per-worktree rows with task, branch and state', async () => {
    await renderGroup({
      inspections: new Map([
        ['/tmp/arca-notif-wt', { state: 'ready', uncommittedChanges: 3, commitsAhead: 2 }],
        ['/tmp/arca-ui-wt', { state: 'ready', uncommittedChanges: 0, commitsAhead: 0 }]
      ])
    })

    await expandGroup()

    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull()
    expect(container.textContent).toContain('Wire notifications')
    expect(container.textContent).toContain('arca-notif')
    expect(container.textContent).toContain('2 ahead')
    expect(container.textContent).toContain('3 uncommitted')
    expect(container.textContent).toContain('clean')
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('asks the parent to remove without force on the first click', async () => {
    const onRemove = vi.fn()
    await renderGroup({
      onRemove,
      inspections: new Map([
        ['/tmp/arca-notif-wt', { state: 'ready', uncommittedChanges: 0, commitsAhead: 0 }]
      ])
    })
    await expandGroup()

    await act(async () => queryButtonByText('Remove')?.click())

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove.mock.calls[0][1]).toBe(false)
  })

  it('shows a destructive confirmation before forcing a removal', async () => {
    const onRemove = vi.fn()
    await renderGroup({
      onRemove,
      agentWorktrees: [TWO_AGENT_WORKTREES[0]],
      confirmingWorktreeId: 'repo::/tmp/arca-notif-wt'
    })
    await expandGroup()

    expect(container.textContent).toContain('Remove it anyway?')
    expect(queryButtonByText('Remove')).toBeUndefined()

    await act(async () => queryButtonByText('Remove anyway')?.click())

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove.mock.calls[0][1]).toBe(true)
  })
})
