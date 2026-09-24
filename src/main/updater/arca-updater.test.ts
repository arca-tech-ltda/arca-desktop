import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type * as ArcaFeedModule from './arca-update-feed'
import { arcaUpdateFeed, arcaUpdateChannel } from './arca-update-feed'

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

function setup(skipAutomatic = false) {
  const updater = new ArcaUpdater()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Only this BrowserWindow subset is used by status delivery.
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  } as unknown as BrowserWindow
  updater.setupAutoUpdater(
    window,
    skipAutomatic ? { getLastUpdateCheckAt: () => Date.now() } : undefined
  )
  return updater
}

describe('ARCA upstream integration', () => {
  it('checks immediately, configures Bearer auth, and waits for an explicit download', async () => {
    const updater = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.autoUpdaterMock.setFeedURL).toHaveBeenCalledWith(
      arcaUpdateFeed(undefined, 'device')
    )
    expect(harness.autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    harness.autoUpdaterMock.emit('checking-for-update')
    harness.autoUpdaterMock.emit('update-available', { version: '1.5.100' })
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(harness.autoUpdaterMock.autoDownload).toBe(false)
    updater.downloadUpdate()
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

  it('keeps automatic feed failures neutral', async () => {
    harness.autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error('Update feed HTTP 404'))
    const updater = setup()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(updater.getUpdateStatus()).toEqual({ state: 'idle' }))
  })

  it('shows a clear access message for a manual feed failure', async () => {
    const updater = setup(true)
    harness.autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error('Update feed HTTP 403'))
    updater.checkForUpdatesFromMenu()
    await vi.waitFor(() =>
      expect(updater.getUpdateStatus()).toMatchObject({
        state: 'error',
        message: 'arca-updater:feed-access-denied',
        userInitiated: true
      })
    )
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

describe('test update channel', () => {
  it('defaults to stable and routes the override on the same origin', () => {
    vi.stubEnv('ARCA_UPDATE_CHANNEL', undefined)
    expect(arcaUpdateFeed(undefined, 'device')?.url).toContain('/updates/stable/')
    vi.stubEnv('ARCA_UPDATE_CHANNEL', 'e2e')
    expect(arcaUpdateFeed(undefined, 'device')?.url).toBe(
      'https://mainframe.arcatech.com.br/api/arca/desktop/updates/e2e/'
    )
    vi.unstubAllEnvs()
  })
  it.each(['e2e', 'stable', 'a-1'])('accepts %s', (channel) => {
    expect(arcaUpdateChannel(channel)).toBe(channel)
  })
  it.each(['', '../stable', 'UPPER', 'a'.repeat(33), 'a/b'])('rejects %s', (channel) => {
    expect(() => arcaUpdateChannel(channel)).toThrow()
  })
})
