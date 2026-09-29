import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { buildSubagentChildRows } from './worktree-subagent-child-rows'

const tab: TerminalTab = {
  id: 'parent-tab',
  ptyId: null,
  worktreeId: 'folder-workspace',
  title: 'Parent',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

function parentWithChild(
  state: NonNullable<AgentStatusEntry['subagents']>[number]['state'],
  subagentObservation?: AgentStatusEntry['subagentObservation']
): AgentStatusEntry {
  return {
    paneKey: 'parent-pane',
    tabId: tab.id,
    worktreeId: tab.worktreeId,
    state: 'working',
    prompt: 'parent prompt',
    updatedAt: 100,
    stateStartedAt: 10,
    stateHistory: [],
    subagentObservation,
    subagents: [{ id: 'child', state, startedAt: 20 }]
  }
}

describe('shared CLI and structured child freshness', () => {
  it.each([
    ['working', true, undefined, 'working'],
    ['working', true, 'live', 'working'],
    ['working', false, undefined, 'unverifiable'],
    ['working', false, 'live', 'unverifiable'],
    ['working', true, 'unverifiable', 'unverifiable'],
    ['working', false, 'unverifiable', 'unverifiable'],
    ['waiting', false, undefined, 'unverifiable'],
    ['waiting', false, 'live', 'unverifiable'],
    ['blocked', false, undefined, 'unverifiable'],
    ['blocked', false, 'live', 'unverifiable'],
    ['unverifiable', true, 'live', 'unverifiable']
  ] as const)(
    '%s with fresh parent %s and transport %s projects %s',
    (state, parentIsFresh, subagentObservation, expected) => {
      const parentEntry = parentWithChild(state, subagentObservation)
      const row = buildSubagentChildRows({ parentEntry, tab, parentIsFresh })[0]
      expect(row.state).toBe(expected)
      expect(row.activationPaneKey).toBe(parentEntry.paneKey)
      expect(row.startedAt).toBe(20)
      expect(parentEntry.subagents).toEqual([{ id: 'child', state, startedAt: 20 }])
    }
  )
})

describe('sidebar tree visibility', () => {
  it('keeps a running subagent', () => {
    const rows = buildSubagentChildRows({
      parentEntry: parentWithChild('working'),
      tab,
      parentIsFresh: true
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('working')
  })

  it('drops a finished subagent', () => {
    expect(
      buildSubagentChildRows({ parentEntry: parentWithChild('idle'), tab, parentIsFresh: true })
    ).toEqual([])
  })

  it('keeps an out-of-contact subagent, because silence is not an ending', () => {
    const rows = buildSubagentChildRows({
      parentEntry: parentWithChild('working'),
      tab,
      parentIsFresh: false
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('unverifiable')
  })
})
