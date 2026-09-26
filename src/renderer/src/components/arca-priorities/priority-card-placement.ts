import {
  FLOATING_TERMINAL_TRIGGER_EDGE_MARGIN,
  FLOATING_TERMINAL_TRIGGER_SAFE_TOP,
  FLOATING_TERMINAL_TRIGGER_SIZE
} from '../floating-terminal/floating-terminal-trigger-position'
import type { FloatingTerminalTriggerLayout } from '../floating-terminal/floating-terminal-trigger-layout-store'

const SIZE = FLOATING_TERMINAL_TRIGGER_SIZE
const MARGIN = FLOATING_TERMINAL_TRIGGER_EDGE_MARGIN
const SAFE_TOP = FLOATING_TERMINAL_TRIGGER_SAFE_TOP
const STACK_GAP = 8
const CARD_WIDTH = 380
const CARD_MIN_WIDTH = 240
const CARD_MAX_HEIGHT = 520
const CARD_MIN_HEIGHT = 160

export type PriorityLauncherPosition = { left: number; top: number }
export type PriorityCardPlacement = {
  left: number
  bottom: number
  width: number
  maxHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Parked one stacking gap above the floating-workspace trigger, or below it near the titlebar. */
export function getPriorityLauncherPosition(
  layout: FloatingTerminalTriggerLayout
): PriorityLauncherPosition {
  const { position, viewport } = layout
  const above = position.top - STACK_GAP - SIZE
  const top = above >= SAFE_TOP ? above : position.top + SIZE + STACK_GAP
  return {
    left: clamp(position.left, MARGIN, viewport.width - SIZE - MARGIN),
    top: clamp(top, SAFE_TOP, viewport.height - SIZE - MARGIN)
  }
}

/**
 * Card geometry anchored to the launcher column: beside it when either side has room,
 * otherwise stacked clear of both buttons so neither is ever covered.
 */
export function getPriorityCardPlacement(
  layout: FloatingTerminalTriggerLayout
): PriorityCardPlacement {
  const { viewport } = layout
  const launcher = getPriorityLauncherPosition(layout)
  const columnLeft = Math.min(launcher.left, layout.position.left)
  const columnRight = Math.max(launcher.left, layout.position.left) + SIZE
  const columnTop = Math.min(launcher.top, layout.position.top)
  const columnBottom = Math.max(launcher.top, layout.position.top) + SIZE
  const width = clamp(viewport.width - MARGIN * 2, CARD_MIN_WIDTH, CARD_WIDTH)

  const leftSide = columnLeft - STACK_GAP - width
  const rightSide = columnRight + STACK_GAP
  const besideLeft =
    leftSide >= MARGIN ? leftSide : rightSide + width <= viewport.width - MARGIN ? rightSide : null
  if (besideLeft !== null) {
    const spaceAboveColumnBottom = columnBottom - SAFE_TOP
    if (spaceAboveColumnBottom >= CARD_MIN_HEIGHT) {
      return {
        left: besideLeft,
        bottom: Math.max(MARGIN, viewport.height - columnBottom),
        width,
        maxHeight: Math.min(CARD_MAX_HEIGHT, spaceAboveColumnBottom)
      }
    }
    // Column hugs the titlebar: grow the card downward from the safe top instead.
    const maxHeight = Math.min(CARD_MAX_HEIGHT, viewport.height - SAFE_TOP - MARGIN)
    return {
      left: besideLeft,
      bottom: Math.max(MARGIN, viewport.height - SAFE_TOP - maxHeight),
      width,
      maxHeight
    }
  }

  // No horizontal room beside the buttons: stack above them, or below when they hug the titlebar.
  const stackedLeft = clamp(
    columnLeft + SIZE / 2 - width / 2,
    MARGIN,
    viewport.width - width - MARGIN
  )
  const spaceAbove = columnTop - STACK_GAP - SAFE_TOP
  if (spaceAbove >= CARD_MIN_HEIGHT) {
    return {
      left: stackedLeft,
      bottom: viewport.height - columnTop + STACK_GAP,
      width,
      maxHeight: Math.min(CARD_MAX_HEIGHT, spaceAbove)
    }
  }
  return {
    left: stackedLeft,
    bottom: MARGIN,
    width,
    maxHeight: Math.min(
      CARD_MAX_HEIGHT,
      Math.max(0, viewport.height - columnBottom - STACK_GAP - MARGIN)
    )
  }
}
