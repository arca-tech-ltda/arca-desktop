import { describe, expect, it } from 'vitest'
import {
  getPriorityCardPlacement,
  getPriorityLauncherPosition,
  type PriorityCardPlacement
} from './priority-card-placement'
import type { FloatingTerminalTriggerLayout } from '../floating-terminal/floating-terminal-trigger-layout-store'

const TRIGGER_SIZE = 36
const VIEWPORT = { width: 1440, height: 900 }

function layout(
  position: { left: number; top: number },
  viewport = VIEWPORT
): FloatingTerminalTriggerLayout {
  return { position, viewport }
}

type Rect = { left: number; top: number; right: number; bottom: number }

function triggerRect(position: { left: number; top: number }): Rect {
  return {
    left: position.left,
    top: position.top,
    right: position.left + TRIGGER_SIZE,
    bottom: position.top + TRIGGER_SIZE
  }
}

function cardRect(placement: PriorityCardPlacement, viewportHeight: number): Rect {
  const bottom = viewportHeight - placement.bottom
  return {
    left: placement.left,
    top: bottom - placement.maxHeight,
    right: placement.left + placement.width,
    bottom
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

describe('getPriorityLauncherPosition', () => {
  it('parks 8px above the trigger at the same x', () => {
    expect(getPriorityLauncherPosition(layout({ left: 1380, top: 792 }))).toEqual({
      left: 1380,
      top: 748
    })
  })

  it('matches the previous default parking spot for the default trigger position', () => {
    // Default trigger: 24px right gap, 72px bottom gap.
    const position = {
      left: VIEWPORT.width - TRIGGER_SIZE - 24,
      top: VIEWPORT.height - TRIGGER_SIZE - 72
    }
    const launcher = getPriorityLauncherPosition(layout(position))
    expect(VIEWPORT.width - launcher.left - TRIGGER_SIZE).toBe(24)
    expect(VIEWPORT.height - launcher.top - TRIGGER_SIZE).toBe(116)
  })

  it('flips below the trigger when there is no room above', () => {
    expect(getPriorityLauncherPosition(layout({ left: 40, top: 40 }))).toEqual({
      left: 40,
      top: 84
    })
  })

  it('keeps the launcher inside a short viewport', () => {
    const launcher = getPriorityLauncherPosition(layout({ left: 10, top: 36 }, { width: 400, height: 120 }))
    expect(launcher.top).toBe(120 - TRIGGER_SIZE - 8)
    expect(launcher.left).toBe(10)
  })
})

describe('getPriorityCardPlacement', () => {
  it('opens beside the button column, bottom-aligned with it', () => {
    const position = { left: 1380, top: 792 }
    const placement = getPriorityCardPlacement(layout(position))
    expect(placement.width).toBe(380)
    expect(placement.left + placement.width).toBe(1380 - 8)
    expect(VIEWPORT.height - placement.bottom).toBe(792 + TRIGGER_SIZE)
  })

  it('opens to the right when the left side has no room', () => {
    const position = { left: 12, top: 700 }
    const placement = getPriorityCardPlacement(layout(position))
    expect(placement.left).toBe(12 + TRIGGER_SIZE + 8)
  })

  it('stacks above the buttons when neither side fits', () => {
    const viewport = { width: 420, height: 900 }
    const position = { left: 190, top: 800 }
    const placement = getPriorityCardPlacement(layout(position, viewport))
    const rect = cardRect(placement, viewport.height)
    expect(rect.bottom).toBeLessThanOrEqual(
      getPriorityLauncherPosition(layout(position, viewport)).top
    )
  })

  it('never covers the floating workspace trigger or the tasks launcher', () => {
    const cases: { position: { left: number; top: number }; viewport: typeof VIEWPORT }[] = [
      { position: { left: 1380, top: 792 }, viewport: VIEWPORT },
      { position: { left: 12, top: 700 }, viewport: VIEWPORT },
      { position: { left: 700, top: 40 }, viewport: VIEWPORT },
      { position: { left: 190, top: 800 }, viewport: { width: 420, height: 900 } },
      { position: { left: 190, top: 60 }, viewport: { width: 420, height: 900 } },
      { position: { left: 8, top: 36 }, viewport: { width: 360, height: 420 } }
    ]
    for (const { position, viewport } of cases) {
      const current = layout(position, viewport)
      const placement = getPriorityCardPlacement(current)
      const card = cardRect(placement, viewport.height)
      expect(overlaps(card, triggerRect(position))).toBe(false)
      expect(overlaps(card, triggerRect(getPriorityLauncherPosition(current)))).toBe(false)
    }
  })

  it('stays inside the viewport', () => {
    const viewport = { width: 420, height: 520 }
    const placement = getPriorityCardPlacement(layout({ left: 190, top: 460 }, viewport))
    const rect = cardRect(placement, viewport.height)
    expect(rect.left).toBeGreaterThanOrEqual(8)
    expect(rect.right).toBeLessThanOrEqual(viewport.width - 8)
    expect(rect.top).toBeGreaterThanOrEqual(36)
    expect(rect.bottom).toBeLessThanOrEqual(viewport.height - 8)
  })
})
