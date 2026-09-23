import { shell } from 'electron'
import { classifyArcaMainframeNavigation } from '../../shared/arca-mainframe'

type NavigationEventListener = (event: Electron.Event, url: string) => void
type FrameNavigationListener = (details: {
  isMainFrame: boolean
  url: string
  preventDefault: () => void
}) => void

/** The slice of `WebContents` this policy needs, so tests can drive it without Electron. */
type ArcaMainframeGuest = {
  on(event: 'will-navigate' | 'will-redirect', listener: NavigationEventListener): unknown
  on(event: 'will-frame-navigate', listener: FrameNavigationListener): unknown
  off?(event: 'will-navigate' | 'will-redirect', listener: NavigationEventListener): unknown
  off?(event: 'will-frame-navigate', listener: FrameNavigationListener): unknown
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
  isDestroyed(): boolean
}

export type ArcaMainframeGuestPolicyOptions = {
  origin: string
  /** Injected so the routing decision is testable without Electron's shell. */
  openExternally?: (url: string) => void
}

function defaultOpenExternally(url: string): void {
  void shell.openExternal(url).catch(() => {
    console.warn('[arca-mainframe] Failed to open link in the system browser')
  })
}

/**
 * The Megamind guest browses one origin. Anything else it tries to reach is either handed to the
 * system browser (http/https) or dropped, and no target ever opens a native child window.
 */
export function installArcaMainframeGuestPolicy(
  guest: ArcaMainframeGuest,
  { origin, openExternally = defaultOpenExternally }: ArcaMainframeGuestPolicyOptions
): () => void {
  const route = (url: string): void => {
    if (classifyArcaMainframeNavigation(origin, url) === 'external') {
      openExternally(url)
    }
  }
  const navigationGuard: NavigationEventListener = (event, url) => {
    if (classifyArcaMainframeNavigation(origin, url) === 'internal') {
      return
    }
    event.preventDefault()
    route(url)
  }
  // Why subframes too: `will-navigate` never fires for them, so an injected iframe would
  // otherwise load an arbitrary origin inside a panel the user reads as the Mainframe.
  const frameNavigationGuard: FrameNavigationListener = (details) => {
    if (
      details.isMainFrame ||
      classifyArcaMainframeNavigation(origin, details.url) === 'internal'
    ) {
      return
    }
    details.preventDefault()
  }

  guest.on('will-navigate', navigationGuard)
  guest.on('will-redirect', navigationGuard)
  guest.on('will-frame-navigate', frameNavigationGuard)
  // Why deny-then-route: a popup would be an unhardened window, while the user's intent (open
  // elsewhere) is still honoured by handing the URL to their own browser.
  guest.setWindowOpenHandler(({ url }) => {
    route(url)
    return { action: 'deny' }
  })

  return () => {
    if (guest.isDestroyed()) {
      return
    }
    guest.off?.('will-navigate', navigationGuard)
    guest.off?.('will-redirect', navigationGuard)
    guest.off?.('will-frame-navigate', frameNavigationGuard)
  }
}
