import { describe, expect, it } from 'vitest'
import { buildSidebarTreeModel } from './sidebar-tree-model'
import type { RenderRow } from './worktree-list/listing/render-row'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
import type { Worktree } from '../../../../shared/worktree/types'

function projectHeader(key: string): RenderRow {
  return { type: 'header', key, label: repo.displayName, count: 1, tone: '', repo }
}

function itemRow(rowKey: string, sectionKey: string, id: string): RenderRow {
  const rowWorktree: Worktree = { ...worktree, id }
  return {
    type: 'item',
    rowKey,
    sectionKey,
    worktree: rowWorktree,
    repo,
    depth: 0,
    groupDepth: 1,
    lineageTrail: [],
    isLastLineageChild: true,
    lineageChildCount: 0
  }
}

describe('sidebar tree model', () => {
  it('merges a project that owns exactly one worktree into its header', () => {
    const rows = [projectHeader('repo:repo-1'), itemRow('r:wt-1', 'repo:repo-1', 'wt-1')]

    const model = buildSidebarTreeModel(rows, 'repo')

    expect(model.mergedWorktreeByHeaderKey.get('repo:repo-1')?.id).toBe('wt-1')
    expect(model.mergedRowKeys.has('r:wt-1')).toBe(true)
    expect(model.guidedRowKeys.size).toBe(0)
  })

  it('keeps one guided branch node per worktree when a project owns two', () => {
    const rows = [
      projectHeader('repo:repo-1'),
      itemRow('r:wt-1', 'repo:repo-1', 'wt-1'),
      itemRow('r:wt-2', 'repo:repo-1', 'wt-2')
    ]

    const model = buildSidebarTreeModel(rows, 'repo')

    expect(model.mergedWorktreeByHeaderKey.size).toBe(0)
    expect(model.mergedRowKeys.size).toBe(0)
    expect([...model.guidedRowKeys]).toEqual(['r:wt-1', 'r:wt-2'])
    expect([...model.lastRowKeysInSection]).toEqual(['r:wt-2'])
  })

  it('leaves a project with a notice row unmerged', () => {
    const rows: RenderRow[] = [
      projectHeader('repo:repo-1'),
      itemRow('r:wt-1', 'repo:repo-1', 'wt-1'),
      {
        type: 'new-external-worktrees-inbox',
        key: 'inbox:repo-1',
        repo,
        inboxWorktrees: []
      }
    ]

    const model = buildSidebarTreeModel(rows, 'repo')

    expect(model.mergedRowKeys.size).toBe(0)
    expect(model.guidedRowKeys.has('r:wt-1')).toBe(true)
  })

  it('stays out of non-project groupings', () => {
    const rows = [projectHeader('all'), itemRow('r:wt-1', 'all', 'wt-1')]

    expect(buildSidebarTreeModel(rows, 'workspace-status').mergedRowKeys.size).toBe(0)
  })
})
