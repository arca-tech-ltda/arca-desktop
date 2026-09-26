import { app, powerMonitor } from 'electron'
import type { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { ReleaseBuild, ReleaseChannel } from '../../shared/release-channel'
import type { ReleaseBuildListOptions } from '../updater-release-build-options'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions,
  UpdateStatus
} from '../../shared/update-status-types'
import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../../shared/remote-server-update'
import { getLinuxPackageType } from '../linux-update-package-type'
import { createUpdaterDiagnosticLogger } from '../linux-package-install-diagnostic'
import { registerAutoUpdaterHandlers } from '../updater-events'
import { getServeUpdateHandoffFailure } from '../serve-update-handoff'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { UpdaterDownloadInstall } from './updater-download-install'
import { AUTO_UPDATE_CHECK_INTERVAL_MS, type UpdateInstallMode } from './updater-state'

export type UpdaterSetupOptions = {
  getLastUpdateCheckAt?: () => number | null
  onBeforeQuit?: () => void | Promise<void>
  setLastUpdateCheckAt?: (timestamp: number) => void
  getPendingUpdateNudgeId?: () => string | null
  setPendingUpdateNudgeId?: (id: string | null) => void
  setDismissedUpdateNudgeId?: (id: string | null) => void
  installMode?: UpdateInstallMode
}

/** Initializes electron-updater and attaches lifecycle/event bridges. */
export class UpdaterSetup extends UpdaterDownloadInstall {
  checkForUpdates(): void {
    this.checkForUpdatesInBackground()
  }

  checkForUpdatesFromMenu(): void {
    super.checkForUpdatesFromMenu()
  }

  downloadUpdate(): void {
    super.downloadUpdate()
  }

  quitAndInstall(): void {
    super.quitAndInstall()
  }

  isQuittingForUpdate(): boolean {
    return super.isQuittingForUpdate()
  }

  getUpdateStatus(): UpdateStatus {
    return super.getUpdateStatus()
  }

  getRemoteServerUpdateSupport(): RemoteServerUpdateSupport {
    return super.getRemoteServerUpdateSupport()
  }

  getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot {
    return super.getRemoteServerUpdaterSnapshot(runtimeId)
  }

  checkForRemoteServerUpdate(
    runtimeId: string,
    options?: UpdateCheckOptions
  ): RemoteServerUpdaterSnapshot {
    return super.checkForRemoteServerUpdate(runtimeId, options)
  }

  downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot {
    return super.downloadRemoteServerUpdate(runtimeId)
  }

  installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult {
    return super.installRemoteServerUpdate(runtimeId)
  }

  resolveUpdateInstallMode(isServeMode: boolean): UpdateInstallMode {
    return super.resolveUpdateInstallMode(isServeMode)
  }

  async getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
    return super.getLinuxPackageInstallInstructions()
  }

  async showLinuxPackage(): Promise<void> {
    return super.showLinuxPackage()
  }

  async listAvailableReleaseBuilds(
    _channel: ReleaseChannel,
    _options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    return []
  }

  dismissNudge(): void {
    super.dismissNudge()
  }

  dismissAvailableUpdate(): void {
    super.dismissAvailableUpdate()
  }

  setupAutoUpdater(mainWindow: BrowserWindow, opts?: UpdaterSetupOptions): void {
    this.mainWindowRef = mainWindow
    this.onBeforeQuitCleanup = opts?.onBeforeQuit ?? null
    this.persistLastUpdateCheckAt = opts?.setLastUpdateCheckAt ?? null
    this._getLastUpdateCheckAt = opts?.getLastUpdateCheckAt ?? null
    this._getPendingUpdateNudgeId = opts?.getPendingUpdateNudgeId ?? null
    this._setPendingUpdateNudgeId = opts?.setPendingUpdateNudgeId ?? null
    this._setDismissedUpdateNudgeId = opts?.setDismissedUpdateNudgeId ?? null
    this.updateInstallMode = opts?.installMode ?? 'interactive'
    this.lastInstallDeferralVersion = { download: null, install: null }

    const serveHandoffFailure = getServeUpdateHandoffFailure()
    if (serveHandoffFailure) {
      recordUpdaterLifecycle(
        'headless_serve_handoff_failed',
        { reason: serveHandoffFailure },
        { level: 'warn', message: 'Supervised serve update did not complete' }
      )
      this.sendErrorStatus(`The server update did not complete: ${serveHandoffFailure}`, true)
    }

    if (!app.isPackaged && !is.dev) {
      return
    }
    if (is.dev) {
      return
    }

    const autoUpdater = this.getAutoUpdater()
    autoUpdater.autoDownload = false
    autoUpdater.allowDowngrade = false
    autoUpdater.disableDifferentialDownload = false
    // Why: supervised serve installs require an explicit handoff; ordinary service quits must never install implicitly.
    // Only an explicit AppImage/non-root marker may opt into electron-updater's implicit quit install.
    autoUpdater.autoInstallOnAppQuit =
      this.updateInstallMode === 'interactive' &&
      (process.platform === 'win32' || getLinuxPackageType() === 'non-root')
    // Why: MacUpdater ignores quitAndInstall arguments; the surviving CLI supervisor must be the only serve relaunch owner.
    autoUpdater.autoRunAppAfterInstall = this.updateInstallMode === 'interactive'
    // Why: our only on-machine window into electron-updater; otherwise an unexpected update-not-available or failed fetch is invisible.
    autoUpdater.logger = createUpdaterDiagnosticLogger() as never

    if (this.autoUpdaterInitialized) {
      return
    }
    this.autoUpdaterInitialized = true

    registerAutoUpdaterHandlers({
      autoUpdater,
      clearBackgroundCheckLaunchPending: () => this.clearBackgroundCheckLaunchPending(),
      clearAvailableUpdateContext: () => this.clearAvailableUpdateContext(),
      getCurrentStatus: () => this.currentStatus,
      getActiveUpdateCheckEventAttemptId: () => this.getActiveUpdateCheckEventAttemptId(),
      getKnownReleaseUrl: () => this.getKnownReleaseUrl(),
      getPendingInstallVersion: () => this.getPendingInstallVersion(),
      getUserInitiatedCheck: () => this.userInitiatedCheck,
      handleQuitAndInstallFailure: (error) => this.handleQuitAndInstallFailure(error),
      isQuitAndInstallHandoffActive: () => this.isQuitAndInstallHandoffActive(),
      hasInstallableDownloadedVersion: () => this.hasInstallableDownloadedVersion(),
      shouldHandleUpdaterErrorEvent: () => this.shouldHandleUpdaterErrorEvent(),
      markUpdateCheckEventAttempt: () => this.markUpdateCheckEventAttempt(),
      performQuitAndInstall: () => this.performQuitAndInstall(),
      shouldDeferMacQuitForInstall: () => this.updateInstallMode === 'interactive',
      recordCompletedUpdateCheck: () => this.recordCompletedUpdateCheck(),
      sendCheckFailureStatus: (message, userInitiated, sourceError) =>
        this.sendCheckFailureStatus(message, userInitiated, sourceError),
      sendErrorStatus: (message, userInitiated) => this.sendErrorStatus(message, userInitiated),
      sendStatus: (status) => this.sendStatus(status),
      scheduleAutomaticUpdateCheck: (delayMs) => this.scheduleAutomaticUpdateCheck(delayMs),
      setAvailableReleaseUrl: (releaseUrl) => {
        this.availableReleaseUrl = releaseUrl
      },
      setAvailableVersion: (version) => {
        this.availableVersion = version
      },
      setUserInitiatedCheck: (value) => {
        this.userInitiatedCheck = value
      }
    })

    const checkOnWake = () => {
      if (
        this.backgroundCheckLaunchPending ||
        this.currentStatus.state === 'checking' ||
        this.currentStatus.state === 'downloading'
      ) {
        return
      }
      const lastCheck = this._getLastUpdateCheckAt?.() ?? null
      const msSince = lastCheck === null ? Number.POSITIVE_INFINITY : Date.now() - lastCheck
      if (msSince >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
        this.runBackgroundUpdateCheck()
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
      }
    }
    powerMonitor.on('resume', checkOnWake)
    app.on('browser-window-focus', checkOnWake)

    const lastUpdateCheckAt = opts?.getLastUpdateCheckAt?.() ?? null
    const msSinceLastCheck =
      lastUpdateCheckAt === null ? Number.POSITIVE_INFINITY : Date.now() - lastUpdateCheckAt
    if (msSinceLastCheck >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
      this.runBackgroundUpdateCheck()
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    } else {
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS - msSinceLastCheck)
    }
  }
}
