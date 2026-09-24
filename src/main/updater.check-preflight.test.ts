import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const feedReader = vi.hoisted(() => vi.fn())
const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('./updater-test-harness')).createUpdaterMocks()
)

vi.mock('./updater/arca-update-feed', () => ({
  MEGAMIND_UPDATE_REQUIRED: 'arca-updater:megamind-required',
  readArcaUpdateFeed: feedReader
}))
vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('@electron-toolkit/utils', () => moduleFactories.electronToolkitUtils())
vi.mock('./ipc/pty', () => moduleFactories.ipcPty())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

const feed = {
  provider: 'generic' as const,
  url: 'https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/',
  channel: 'latest',
  useMultipleRangeRequest: false,
  requestHeaders: { Authorization: 'Bearer updater-test-device' }
}

warmUpdaterModule()

describe('updater feed preflight', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    feedReader.mockReset().mockResolvedValue(feed)
  })

  it('shows checking immediately while the authenticated feed is loading', async () => {
    let resolveFeed: (value: typeof feed) => void = () => {}
    feedReader.mockImplementation(() => new Promise((resolve) => (resolveFeed = resolve)))
    const send = vi.fn()
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater({ webContents: { send } } as never, {
      getLastUpdateCheckAt: () => Date.now()
    })

    checkForUpdatesFromMenu()

    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'checking',
      userInitiated: true
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()

    resolveFeed(feed)
    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
  })

  it('ignores stale updater events while feed credentials are loading', async () => {
    let resolveFeed: (value: typeof feed) => void = () => {}
    feedReader.mockImplementation(() => new Promise((resolve) => (resolveFeed = resolve)))
    const send = vi.fn()
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater({ webContents: { send } } as never, {
      getLastUpdateCheckAt: () => Date.now()
    })
    checkForUpdatesFromMenu()
    send.mockClear()

    autoUpdaterMock.emit('update-not-available')
    expect(send).not.toHaveBeenCalledWith('updater:status', {
      state: 'not-available',
      userInitiated: true
    })

    resolveFeed(feed)
    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
  })

  it('deduplicates repeated manual checks during feed preflight', async () => {
    feedReader.mockImplementation(() => new Promise(() => {}))
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater({ webContents: { send: vi.fn() } } as never, {
      getLastUpdateCheckAt: () => Date.now()
    })

    checkForUpdatesFromMenu()
    checkForUpdatesFromMenu()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })
})
