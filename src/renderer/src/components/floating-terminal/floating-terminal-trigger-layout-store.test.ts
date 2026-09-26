import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FloatingTerminalTriggerLayoutStore from './floating-terminal-trigger-layout-store'

type ResizeListener = () => void

const resizeListeners: ResizeListener[] = []
const stubbedViewport = { width: 0, height: 0 }

function stubWindow(width: number, height: number): void {
  setViewportSize(width, height)
  vi.stubGlobal('window', {
    get innerWidth() {
      return stubbedViewport.width
    },
    get innerHeight() {
      return stubbedViewport.height
    },
    addEventListener: (type: string, listener: ResizeListener) => {
      if (type === 'resize') {
        resizeListeners.push(listener)
      }
    },
    removeEventListener: (type: string, listener: ResizeListener) => {
      const index = resizeListeners.indexOf(listener)
      if (type === 'resize' && index !== -1) {
        resizeListeners.splice(index, 1)
      }
    }
  })
}

function setViewportSize(width: number, height: number): void {
  stubbedViewport.width = width
  stubbedViewport.height = height
}

function setViewport(width: number, height: number): void {
  setViewportSize(width, height)
  for (const listener of resizeListeners.slice()) {
    listener()
  }
}

async function loadStore(): Promise<typeof FloatingTerminalTriggerLayoutStore> {
  vi.resetModules()
  return import('./floating-terminal-trigger-layout-store')
}

describe('floating terminal trigger layout store', () => {
  beforeEach(() => {
    resizeListeners.length = 0
    stubWindow(1200, 800)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to the default trigger placement with no publisher', async () => {
    const store = await loadStore()
    expect(store.getFloatingTerminalTriggerLayout()).toEqual({
      position: { left: 1140, top: 692 },
      viewport: { width: 1200, height: 800 }
    })
  })

  it('notifies subscribers when a published position changes', async () => {
    const store = await loadStore()
    const listener = vi.fn()
    const stop = store.subscribeFloatingTerminalTriggerLayout(listener)

    store.publishFloatingTerminalTriggerPosition({ left: 40, top: 120 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getFloatingTerminalTriggerLayout().position).toEqual({ left: 40, top: 120 })

    store.publishFloatingTerminalTriggerPosition({ left: 40, top: 120 })
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('tracks viewport resizes while subscribed and stops after the last unsubscribe', async () => {
    const store = await loadStore()
    const listener = vi.fn()
    const stop = store.subscribeFloatingTerminalTriggerLayout(listener)

    setViewport(900, 600)
    expect(store.getFloatingTerminalTriggerLayout()).toEqual({
      position: { left: 840, top: 492 },
      viewport: { width: 900, height: 600 }
    })

    stop()
    expect(resizeListeners).toHaveLength(0)
  })

  it('restores the default placement when the publisher unmounts', async () => {
    const store = await loadStore()
    store.publishFloatingTerminalTriggerPosition({ left: 40, top: 120 })
    store.publishFloatingTerminalTriggerPosition(null)
    expect(store.getFloatingTerminalTriggerLayout().position).toEqual({ left: 1140, top: 692 })
  })
})
