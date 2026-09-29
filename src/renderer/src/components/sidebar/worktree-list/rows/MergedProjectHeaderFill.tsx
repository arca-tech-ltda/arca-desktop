import React from 'react'

/**
 * Selected fill for a project header that stands in for its only worktree. An
 * overlay, not a row background: it repeats the worktree card's fill geometry
 * (4px left inset, flush right, rounded-lg) without moving the title.
 */
export function MergedProjectHeaderFill({ active }: { active: boolean }): React.JSX.Element | null {
  return active ? (
    <span
      aria-hidden
      data-project-header-active="true"
      className="pointer-events-none absolute inset-y-0 left-1 right-0 rounded-lg"
    />
  ) : null
}
