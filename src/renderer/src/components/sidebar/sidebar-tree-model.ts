import type { Worktree } from '../../../../shared/worktree/types'
import type { RenderRow } from './worktree-list/listing/render-row'
import type { WorktreeGroupBy } from './worktree-list/grouping/row-types'

export type SidebarTreeModel = {
  /** Project header key -> the single worktree whose branch the header now carries. */
  mergedWorktreeByHeaderKey: ReadonlyMap<string, Worktree>
  /** Worktree row keys that render as agents only, hanging off their project header. */
  mergedRowKeys: ReadonlySet<string>
  /** Worktree row keys that are the last node of their project section. */
  lastRowKeysInSection: ReadonlySet<string>
  /** Worktree row keys drawn as a branch node hanging off a project header. */
  guidedRowKeys: ReadonlySet<string>
}

export const EMPTY_SIDEBAR_TREE_MODEL: SidebarTreeModel = {
  mergedWorktreeByHeaderKey: new Map(),
  mergedRowKeys: new Set(),
  lastRowKeysInSection: new Set(),
  guidedRowKeys: new Set()
}

function isProjectHeader(row: RenderRow): boolean {
  return row.type === 'header' && row.repo !== undefined
}

/**
 * Tree shape for the worktree sidebar: a project that owns exactly one plain
 * worktree stops printing that worktree as its own line. Its branch moves onto
 * the project header and the worktree's agents hang directly off the project.
 * Projects with two or more worktrees keep one branch node per worktree.
 */
export function buildSidebarTreeModel(
  rows: readonly RenderRow[],
  groupBy: WorktreeGroupBy
): SidebarTreeModel {
  if (groupBy !== 'repo') {
    return EMPTY_SIDEBAR_TREE_MODEL
  }
  const mergedWorktreeByHeaderKey = new Map<string, Worktree>()
  const mergedRowKeys = new Set<string>()
  const lastRowKeysInSection = new Set<string>()
  const guidedRowKeys = new Set<string>()

  for (let index = 0; index < rows.length; index++) {
    const header = rows[index]
    if (!header || !isProjectHeader(header) || header.type !== 'header') {
      continue
    }
    let cursor = index + 1
    const sectionRows: RenderRow[] = []
    while (cursor < rows.length) {
      const row = rows[cursor]
      if (!row || row.type === 'header' || row.type === 'host-header') {
        break
      }
      sectionRows.push(row)
      cursor++
    }
    const lastSectionRow = sectionRows
      .toReversed()
      .find((row) => row.type === 'item' || row.type === 'lineage-group')
    if (lastSectionRow?.type === 'item') {
      lastRowKeysInSection.add(lastSectionRow.rowKey)
    } else if (lastSectionRow?.type === 'lineage-group' && lastSectionRow.rows[0]) {
      lastRowKeysInSection.add(lastSectionRow.rows[0].rowKey)
    }
    // Why: a notice, a pending create or a lineage group means the project has
    // more than one thing to say, so it keeps its own header line.
    const onlyRow = sectionRows.length === 1 ? sectionRows[0] : undefined
    if (onlyRow?.type === 'item' && onlyRow.depth === 0 && onlyRow.lineageChildCount === 0) {
      mergedWorktreeByHeaderKey.set(header.key, onlyRow.worktree)
      mergedRowKeys.add(onlyRow.rowKey)
      continue
    }
    for (const row of sectionRows) {
      if (row.type === 'item' && row.depth === 0) {
        guidedRowKeys.add(row.rowKey)
      } else if (row.type === 'lineage-group' && row.rows[0]) {
        guidedRowKeys.add(row.rows[0].rowKey)
      }
    }
  }

  return { mergedWorktreeByHeaderKey, mergedRowKeys, lastRowKeysInSection, guidedRowKeys }
}
