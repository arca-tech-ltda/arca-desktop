import { BrowserWindow } from 'electron'
import { ARCA_MAINFRAME_PARTITION } from '../../shared/arca-mainframe'
import { getArcaMainframeEndpoint } from '../arca-mainframe/arca-mainframe-endpoint'
import { installArcaMainframeGuestPolicy } from '../arca-mainframe/arca-mainframe-guest-policy'
import { isBackgroundLaunch } from '../window/foreground-activation-policy'
import { buildMainframeIdentityScript, buildMainframeUserScript } from './mainframe-user-script'
import type { MainframeUserRequest } from './mainframe-user-script'

/** `login` = the partition holds no PocketBase session; the caller must offer the login window. */
export type MainframeUserResult = 'login' | { status: number; data: unknown }

export type MainframeUserRunner = (
  request: Omit<MainframeUserRequest, 'origin'> | 'identity'
) => Promise<MainframeUserResult>

/**
 * A hidden document on the Mainframe origin, kept in the app's dedicated partition, whose only job
 * is to run the scripts in `mainframe-user-script.ts`.
 *
 * Why a guest at all: PocketBase keeps the human's session in `localStorage`, which no main-process
 * API can read, and copying that token into main would widen its blast radius to logs, crash dumps
 * and every other main-process caller. Keeping the fetch inside the guest keeps the token where the
 * browser already put it.
 *
 * Why a JSON endpoint and not the panel: `/api/health` is same-origin (so the session is visible)
 * but carries no application code, so the hidden window never executes the remote SPA. If that page
 * cannot be loaded we fall back to the panel URL, which is what the visible panel used to load.
 *
 * See docs/reference/megamind-human-session.md.
 */
/** Offline Mainframe: the retry window doubles from 5s so a failed load cannot churn windows. */
const MIN_RETRY_DELAY = 5_000
const MAX_RETRY_DELAY = 300_000

export class MainframeUserGuest {
  private window: BrowserWindow | null = null
  private opening: Promise<BrowserWindow | null> | null = null
  private closed = false
  private retryDelay = MIN_RETRY_DELAY
  private retryAt = 0

  private forget(window: BrowserWindow): void {
    if (this.window === window) {
      this.window = null
    }
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }

  private create(): Promise<BrowserWindow | null> {
    const endpoint = getArcaMainframeEndpoint()
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      width: 480,
      height: 360,
      webPreferences: {
        partition: ARCA_MAINFRAME_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    installArcaMainframeGuestPolicy(window.webContents, { origin: endpoint.origin })
    window.on('closed', () => {
      if (this.window === window) {
        this.window = null
      }
    })
    // A crashed or hung renderer keeps answering `isDestroyed() === false`, so drop it explicitly.
    window.webContents.on('render-process-gone', () => this.forget(window))
    window.on('unresponsive', () => this.forget(window))
    const load = window.webContents
      .loadURL(new URL('/api/health', endpoint.origin).href)
      .catch(() => window.webContents.loadURL(endpoint.panelUrl))
    return load.then(
      () => {
        if (this.closed || window.isDestroyed()) {
          this.forget(window)
          return null
        }
        this.window = window
        this.retryDelay = MIN_RETRY_DELAY
        this.retryAt = 0
        return window
      },
      () => {
        this.forget(window)
        this.retryAt = Date.now() + this.retryDelay
        this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY)
        return null
      }
    )
  }

  private ready(): Promise<BrowserWindow | null> {
    if (this.window && !this.window.isDestroyed()) {
      return Promise.resolve(this.window)
    }
    // The app is quitting: a late poll must not open another window.
    if (this.closed || Date.now() < this.retryAt) {
      return Promise.resolve(null)
    }
    this.opening ??= this.create().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  async run(request: Parameters<MainframeUserRunner>[0]): Promise<MainframeUserResult> {
    const window = await this.ready()
    if (!window || window.isDestroyed()) {
      throw new Error('Mainframe session unavailable')
    }
    const origin = getArcaMainframeEndpoint().origin
    const script =
      request === 'identity'
        ? buildMainframeIdentityScript(origin)
        : buildMainframeUserScript({ ...request, origin })
    const result: unknown = await window.webContents.executeJavaScript(script)
    if (result === null || result === undefined) {
      return 'login'
    }
    if (
      typeof result !== 'object' ||
      !('status' in result) ||
      typeof result.status !== 'number' ||
      !('data' in result)
    ) {
      throw new Error('Invalid Mainframe response')
    }
    return { status: result.status, data: result.data }
  }

  close(): void {
    this.closed = true
    if (this.window) {
      this.forget(this.window)
    }
    this.window = null
  }
}

const guest = new MainframeUserGuest()

export const runMainframeUserRequest: MainframeUserRunner = (request) => guest.run(request)

export function closeMainframeUserGuest(): void {
  guest.close()
}

let loginWindow: BrowserWindow | null = null

/** The Mainframe login, in the same partition the hidden guest reads, so signing in there is enough. */
export function openMainframeLogin(onClosed: () => void): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    if (!isBackgroundLaunch()) {
      loginWindow.focus()
    }
    return
  }
  const endpoint = getArcaMainframeEndpoint()
  const window = new BrowserWindow({
    show: false,
    width: 520,
    height: 760,
    title: 'ARCA Mainframe',
    webPreferences: {
      partition: ARCA_MAINFRAME_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  loginWindow = window
  installArcaMainframeGuestPolicy(window.webContents, { origin: endpoint.origin })
  window.once('ready-to-show', () => {
    if (!isBackgroundLaunch()) {
      window.show()
    }
  })
  window.on('closed', () => {
    loginWindow = null
    onClosed()
  })
  void window.loadURL(endpoint.panelUrl).catch(() => window.destroy())
}
