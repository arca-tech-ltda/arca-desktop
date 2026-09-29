import React from 'react'

import { cn } from '@/lib/utils'

/** Width of one guide lane. Every tree level lands on this fixed grid. */
export const SIDEBAR_TREE_GUIDE_LANE_PX = 14

const NO_ANCESTORS: readonly boolean[] = []

type SidebarTreeGuideProps = {
  /** One entry per ancestor level, outermost first: true when that ancestor has
   *  later siblings and its vertical guide must pass through this row. */
  ancestorsContinue?: readonly boolean[]
  /** Last child of its parent: elbow (└─) instead of tee (├─). */
  isLast?: boolean
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
  className,
  style
}: SidebarTreeGuideProps): React.JSX.Element {
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
            isLast ? 'h-1/2' : 'bottom-0'
          )}
        />
        <span className="absolute left-1/2 right-0 top-1/2 h-px bg-sidebar-tree-guide" />
      </span>
    </span>
  )
}
