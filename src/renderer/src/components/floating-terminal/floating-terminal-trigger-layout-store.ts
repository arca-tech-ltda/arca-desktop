import { useSyncExternalStore } from 'react'
import { addViewportSizeChangeListener } from '@/hooks/viewport-size-change-listener'
import {
  getDefaultFloatingTerminalTriggerPosition,
  getFloatingTerminalViewport,
  type FloatingTerminalTriggerPosition,
  type FloatingTerminalViewport
} from './floating-terminal-trigger-position'

export type FloatingTerminalTriggerLayout = {
  position: FloatingTerminalTriggerPosition
  viewport: FloatingTerminalViewport
}

/**
 * Live screen position of the draggable floating-workspace trigger, so surfaces that park
 * next to it (the project-tasks launcher) follow the same drag without owning a second one.
 */
const listeners = new Set<() => void>()
let publishedPosition: FloatingTerminalTriggerPosition | null = null
let stopViewportListener: (() => void) | null = null
let snapshot: FloatingTerminalTriggerLayout = readLayout()

function readLayout(): FloatingTerminalTriggerLayout {
  return {
    position: publishedPosition ?? getDefaultFloatingTerminalTriggerPosition(),
    viewport: getFloatingTerminalViewport()
  }
}

function refreshSnapshot(): void {
  const next = readLayout()
  if (
    next.position.left === snapshot.position.left &&
    next.position.top === snapshot.position.top &&
    next.viewport.width === snapshot.viewport.width &&
    next.viewport.height === snapshot.viewport.height
  ) {
    return
  }
  snapshot = next
  for (const listener of listeners) {
    listener()
  }
}

export function publishFloatingTerminalTriggerPosition(
  position: FloatingTerminalTriggerPosition | null
): void {
  publishedPosition = position
  refreshSnapshot()
}

export function getFloatingTerminalTriggerLayout(): FloatingTerminalTriggerLayout {
  return snapshot
}

export function subscribeFloatingTerminalTriggerLayout(listener: () => void): () => void {
  // Resize events are only tracked while somebody listens, so re-read before the first one lands.
  refreshSnapshot()
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    stopViewportListener = addViewportSizeChangeListener(refreshSnapshot)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopViewportListener?.()
      stopViewportListener = null
    }
  }
}

export function useFloatingTerminalTriggerLayout(): FloatingTerminalTriggerLayout {
  return useSyncExternalStore(
    subscribeFloatingTerminalTriggerLayout,
    getFloatingTerminalTriggerLayout,
    getFloatingTerminalTriggerLayout
  )
}
