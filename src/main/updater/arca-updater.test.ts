import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type * as ArcaFeedModule from './arca-update-feed'
import { arcaUpdateFeed } from './arca-update-feed'

const harness = await vi.hoisted(async () =>
  (await import('../updater-test-harness')).createUpdaterMocks()
)
const feedReader = vi.hoisted(() => vi.fn())
vi.mock('electron', () => harness.moduleFactories.electron())
vi.mock('../electron-updater-loader', () => harness.moduleFactories.electronUpdaterLoader())
vi.mock('@electron-toolkit/utils', () => harness.moduleFactories.electronToolkitUtils())
vi.mock('../ipc/pty', () => harness.moduleFactories.ipcPty())
vi.mock('../linux-update-package-type', () => harness.moduleFactories.linuxUpdatePackageType())
vi.mock('../updater-lifecycle-diagnostics', () =>
  harness.moduleFactories.updaterLifecycleDiagnostics()
)
vi.mock('../updater-nudge', () => harness.moduleFactories.updaterNudge())
vi.mock('../update-install-exit-watchdog', () =>
  harness.moduleFactories.updateInstallExitWatchdog()
)
vi.mock('../updater-prerelease-feed', () => harness.moduleFactories.updaterPrereleaseFeed())
vi.mock('./arca-update-feed', async (original) => ({
  ...(await original<typeof ArcaFeedModule>()),
  readArcaUpdateFeed: feedReader
}))
import { ArcaUpdater } from './arca-updater'

const platform = process.platform
beforeEach(() => {
  harness.resetUpdaterMocks()
  harness.autoUpdaterMock.downloadUpdate.mockResolvedValue([])
  vi.useFakeTimers()
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    configurable: true
  })
  feedReader.mockResolvedValue(arcaUpdateFeed(undefined, 'device'))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
})

function setup() {
  const updater = new ArcaUpdater()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Only this BrowserWindow subset is used by status delivery.
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  } as unknown as BrowserWindow
  updater.setupAutoUpdater(window)
  return updater
}

describe('ARCA upstream integration', () => {
  it('checks immediately, configures Bearer auth, and downloads in background', async () => {
    const updater = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.autoUpdaterMock.setFeedURL).toHaveBeenCalledWith(
      arcaUpdateFeed(undefined, 'device')
    )
    expect(harness.autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    harness.autoUpdaterMock.emit('checking-for-update')
    harness.autoUpdaterMock.emit('update-available', { version: '1.5.100' })
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updater.getUpdateStatus().state).toBe('downloading')
    expect(harness.autoUpdaterMock.autoInstallOnAppQuit).toBe(true)
    expect(harness.fetchNudgeMock).not.toHaveBeenCalled()
  })

  it('stays inactive without enrollment and retries stable after enrollment', async () => {
    feedReader.mockResolvedValue(null)
    const updater = setup()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(harness.autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'error',
      message: 'arca-updater:megamind-required'
    })
    await vi.advanceTimersByTimeAsync(1_000)
    feedReader.mockResolvedValue(arcaUpdateFeed(undefined, 'new-device'))
    updater.checkForUpdatesFromMenu({
      channel: 'hourly',
      targetTag: 'v1.0',
      includePrerelease: true
    })
    await vi.waitFor(() => {
      expect(harness.autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith(
        arcaUpdateFeed(undefined, 'new-device')
      )
    })
    expect(await updater.listAvailableReleaseBuilds('hourly')).toEqual([])
  })

  it('rechecks after four hours without nudges or upstream release discovery', async () => {
    setup()
    await vi.advanceTimersByTimeAsync(0)
    harness.autoUpdaterMock.emit('checking-for-update')
    harness.autoUpdaterMock.emit('update-not-available')
    await vi.advanceTimersByTimeAsync(4 * 60 * 60_000 - 60_000)
    expect(harness.autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2)
  })
})
