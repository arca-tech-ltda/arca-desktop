import React from 'react'

import { cn } from '@/lib/utils'

/** Width of one guide lane. Every tree level lands on this fixed grid. */
export const SIDEBAR_TREE_GUIDE_LANE_PX = 14
/** Half of the 28px header/branch row, so an overlaid connector meets its label's midline. */
export const SIDEBAR_TREE_GUIDE_CONNECTOR_TOP_PX = 14
/** A branch node hangs one lane below its project, plus the gap the compact agent row
 *  pads with, so branch labels and agent labels share one column. */
export const SIDEBAR_TREE_BRANCH_NODE_CONTENT_OFFSET_PX = SIDEBAR_TREE_GUIDE_LANE_PX + 4

const NO_ANCESTORS: readonly boolean[] = []

type SidebarTreeGuideProps = {
  /** One entry per ancestor level, outermost first: true when that ancestor has
   *  later siblings and its vertical guide must pass through this row. */
  ancestorsContinue?: readonly boolean[]
  /** Last child of its parent: elbow (└─) instead of tee (├─). */
  isLast?: boolean
  /** Connector height from the top, for rails taller than their own row (a branch
   *  node whose trunk must keep running past the agents nested under it). */
  connectorTopPx?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Hairline tree guides for sidebar rows. Drawn with 1px backgrounds rather than
 * box-drawing glyphs so the rails stay crisp at fractional HiDPI scales and keep
 * their grid when the virtualizer recycles rows at sub-pixel offsets.
 */
export function SidebarTreeGuide({
  ancestorsContinue = NO_ANCESTORS,
  isLast = false,
  connectorTopPx,
  className,
  style
}: SidebarTreeGuideProps): React.JSX.Element {
  const connectorTop = connectorTopPx === undefined ? undefined : `${connectorTopPx}px`
  return (
    <span
      aria-hidden
      data-sidebar-tree-guide=""
      className={cn('relative flex shrink-0 self-stretch', className)}
      style={style}
    >
      {ancestorsContinue.map((continues, level) => (
        <span key={level} className="relative block w-3.5">
          {continues ? (
            <span className="absolute inset-y-0 left-1/2 w-px bg-sidebar-tree-guide" />
          ) : null}
        </span>
      ))}
      <span className="relative block w-3.5">
        <span
          className={cn(
            'absolute left-1/2 top-0 w-px bg-sidebar-tree-guide',
            isLast ? (connectorTop === undefined ? 'h-1/2' : undefined) : 'bottom-0'
          )}
          style={isLast && connectorTop !== undefined ? { height: connectorTop } : undefined}
        />
        <span
          className={cn(
            'absolute left-1/2 right-0 h-px bg-sidebar-tree-guide',
            connectorTop === undefined && 'top-1/2'
          )}
          style={connectorTop === undefined ? undefined : { top: connectorTop }}
        />
      </span>
    </span>
  )
}
