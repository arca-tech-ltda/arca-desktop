import { describe, expect, it, vi } from 'vitest'
import { installArcaMainframeGuestPolicy } from './arca-mainframe-guest-policy'

const ORIGIN = 'https://mainframe.arcatech.com.br'

type Listener = (...args: unknown[]) => void

function createGuest(): {
  guest: Parameters<typeof installArcaMainframeGuestPolicy>[0]
  emit: (event: string, ...args: unknown[]) => void
  windowOpen: (url: string) => { action: 'deny' }
  listenerCount: () => number
  destroy: () => void
} {
  const listeners = new Map<string, Set<Listener>>()
  let windowOpenHandler: ((details: { url: string }) => { action: 'deny' }) | null = null
  let destroyed = false
  const guest = {
    on: (event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(event, set)
    },
    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener)
    },
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => {
      windowOpenHandler = handler
    },
    isDestroyed: () => destroyed
  }
  return {
    // The fake mirrors the structural port the policy declares; the cast only erases event names.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double whose `on`/`off` accept every event the policy registers.
    guest: guest as unknown as Parameters<typeof installArcaMainframeGuestPolicy>[0],
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    },
    windowOpen: (url) => windowOpenHandler!({ url }),
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    destroy: () => {
      destroyed = true
    }
  }
}

function navigationEvent(): Electron.Event & { prevented: boolean } {
  const event = {
    prevented: false,
    preventDefault: (): void => {
      event.prevented = true
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the policy only ever calls preventDefault on this event.
  return event as Electron.Event & { prevented: boolean }
}

describe('installArcaMainframeGuestPolicy', () => {
  it('lets same-origin navigation through untouched', () => {
    const openExternally = vi.fn()
    const { guest, emit } = createGuest()
    installArcaMainframeGuestPolicy(guest, { origin: ORIGIN, openExternally })

    const event = navigationEvent()
    emit('will-navigate', event, `${ORIGIN}/megamind/approvals/7`)

    expect(event.prevented).toBe(false)
    expect(openExternally).not.toHaveBeenCalled()
  })

  it('blocks a cross-origin navigation and opens it in the system browser', () => {
    const openExternally = vi.fn()
    const { guest, emit } = createGuest()
    installArcaMainframeGuestPolicy(guest, { origin: ORIGIN, openExternally })

    for (const event of ['will-navigate', 'will-redirect']) {
      const navigation = navigationEvent()
      emit(event, navigation, 'https://github.com/arca/repo')
      expect(navigation.prevented).toBe(true)
    }

    expect(openExternally).toHaveBeenCalledTimes(2)
    expect(openExternally).toHaveBeenCalledWith('https://github.com/arca/repo')
  })

  it('blocks a non-web navigation without routing it anywhere', () => {
    const openExternally = vi.fn()
    const { guest, emit } = createGuest()
    installArcaMainframeGuestPolicy(guest, { origin: ORIGIN, openExternally })

    const event = navigationEvent()
    emit('will-navigate', event, 'file:///Users/me/.ssh/id_rsa')

    expect(event.prevented).toBe(true)
    expect(openExternally).not.toHaveBeenCalled()
  })

  it('blocks a cross-origin subframe but leaves the main frame to will-navigate', () => {
    const openExternally = vi.fn()
    const { guest, emit } = createGuest()
    installArcaMainframeGuestPolicy(guest, { origin: ORIGIN, openExternally })

    const blocked = { isMainFrame: false, url: 'https://ads.example/pixel', prevented: false }
    emit('will-frame-navigate', {
      ...blocked,
      preventDefault: () => {
        blocked.prevented = true
      }
    })
    expect(blocked.prevented).toBe(true)
    // Why not routed: a frame the page moved by itself is not the user asking for a browser tab.
    expect(openExternally).not.toHaveBeenCalled()

    const allowed = { isMainFrame: false, url: `${ORIGIN}/embed`, prevented: false }
    emit('will-frame-navigate', {
      ...allowed,
      preventDefault: () => {
        allowed.prevented = true
      }
    })
    expect(allowed.prevented).toBe(false)
  })

  it('denies every window.open and routes only web targets outward', () => {
    const openExternally = vi.fn()
    const { guest, windowOpen } = createGuest()
    installArcaMainframeGuestPolicy(guest, { origin: ORIGIN, openExternally })

    expect(windowOpen('https://docs.example/guide')).toEqual({ action: 'deny' })
    expect(windowOpen('javascript:alert(1)')).toEqual({ action: 'deny' })
    expect(windowOpen(`${ORIGIN}/megamind`)).toEqual({ action: 'deny' })

    expect(openExternally).toHaveBeenCalledTimes(1)
    expect(openExternally).toHaveBeenCalledWith('https://docs.example/guide')
  })

  it('removes its listeners on dispose', () => {
    const { guest, listenerCount } = createGuest()
    const dispose = installArcaMainframeGuestPolicy(guest, { origin: ORIGIN })

    expect(listenerCount()).toBe(3)
    dispose()
    expect(listenerCount()).toBe(0)
  })
})
