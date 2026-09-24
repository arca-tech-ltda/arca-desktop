import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const { appMock, browserWindowMock, nativeUpdaterMock, autoUpdaterMock, isMock, killAllPtyMock } =
  vi.hoisted(() => {
    const appEventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()
    const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()

    const appOn = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = appEventHandlers.get(event) ?? []
      handlers.push(handler)
      appEventHandlers.set(event, handlers)
      return appMock
    })

    const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = eventHandlers.get(event) ?? []
      handlers.push(handler)
      eventHandlers.set(event, handlers)
      return autoUpdaterMock
    })

    const emit = (event: string, ...args: unknown[]) => {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler(...args)
      }
    }

    const reset = () => {
      appEventHandlers.clear()
      appOn.mockClear()
      eventHandlers.clear()
      on.mockClear()
      autoUpdaterMock.checkForUpdates.mockReset()
      autoUpdaterMock.downloadUpdate.mockReset()
      autoUpdaterMock.quitAndInstall.mockReset()
      autoUpdaterMock.setFeedURL.mockClear()
    }

    const autoUpdaterMock = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      on,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
      setFeedURL: vi.fn(),
      emit,
      reset
    }

    return {
      appMock: {
        isPackaged: true,
        getVersion: vi.fn(() => '1.0.51'),
        on: appOn,
        quit: vi.fn()
      },
      browserWindowMock: {
        getAllWindows: vi.fn(() => [])
      },
      nativeUpdaterMock: {
        on: vi.fn()
      },
      autoUpdaterMock,
      isMock: { dev: false },
      killAllPtyMock: vi.fn()
    }
  })

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: browserWindowMock,
  autoUpdater: nativeUpdaterMock,
  powerMonitor: { on: vi.fn() },
  net: { fetch: vi.fn(), request: vi.fn() }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock
}))

vi.mock('./electron-updater-loader', () => ({
  loadElectronAutoUpdater: () => autoUpdaterMock
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: isMock
}))

vi.mock('./ipc/pty', () => ({
  killAllPty: killAllPtyMock
}))

vi.mock('./updater-nudge', () => ({
  fetchNudge: vi.fn().mockResolvedValue(null),
  shouldApplyNudge: vi.fn().mockReturnValue(false)
}))

const ONE_HOUR_MS = 60 * 60 * 1000
const THIRTY_SECONDS_MS = 30 * 1000
function makeBenignCheckFailure(message: string): void {
  const error = new Error(message)
  autoUpdaterMock.checkForUpdates.mockImplementation(() => {
    autoUpdaterMock.emit('checking-for-update')
    queueMicrotask(() => {
      autoUpdaterMock.emit('error', error)
    })
    return Promise.reject(error)
  })
}

warmUpdaterModule()

describe('updater check failure handling', () => {
  beforeEach(() => {
    vi.resetModules()
    autoUpdaterMock.reset()
    nativeUpdaterMock.on.mockReset()
    browserWindowMock.getAllWindows.mockReset()
    browserWindowMock.getAllWindows.mockReturnValue([])
    appMock.getVersion.mockReset()
    appMock.getVersion.mockReturnValue('1.0.51')
    appMock.quit.mockReset()
    appMock.isPackaged = true
    isMock.dev = false
    killAllPtyMock.mockReset()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('silently drops background benign failures to idle and waits for the hourly retry', async () => {
    vi.useFakeTimers()
    makeBenignCheckFailure('net::ERR_FAILED')

    const sendMock = vi.fn()
    const mainWindow = { webContents: { send: sendMock } }

    const { setupAutoUpdater, checkForUpdates } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow as never, {
      getLastUpdateCheckAt: () => Date.now()
    })
    checkForUpdates()

    await vi.advanceTimersByTimeAsync(0)

    const statuses = sendMock.mock.calls
      .filter(([channel]) => channel === 'updater:status')
      .map(([, status]) => status)

    expect(statuses).toContainEqual({ state: 'idle' })
    expect(statuses).not.toContainEqual(expect.objectContaining({ state: 'error' }))
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(THIRTY_SECONDS_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS - THIRTY_SECONDS_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('backs off consecutive failing background retries instead of re-checking hourly forever', async () => {
    vi.useFakeTimers()
    makeBenignCheckFailure('net::ERR_FAILED')

    const sendMock = vi.fn()
    const mainWindow = { webContents: { send: sendMock } }

    const { setupAutoUpdater, checkForUpdates } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow as never, {
      getLastUpdateCheckAt: () => Date.now()
    })
    checkForUpdates()
    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)

    // First retry keeps the fast 1h cadence for transient release-readiness failures.
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2)

    // Second retry doubles to 2h: nothing at +1h, fires by +2h.
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(3)

    // Third retry doubles to 4h.
    await vi.advanceTimersByTimeAsync(2 * ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(2 * ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(4)

    // A completed check resets the backoff to the fast retry.
    autoUpdaterMock.checkForUpdates.mockImplementation(() => {
      autoUpdaterMock.emit('checking-for-update')
      queueMicrotask(() => {
        autoUpdaterMock.emit('update-not-available', { version: '1.0.51' })
      })
      return Promise.resolve(null)
    })
    checkForUpdates()
    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(5)

    makeBenignCheckFailure('net::ERR_FAILED')
    checkForUpdates()
    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(7)
  })
})
