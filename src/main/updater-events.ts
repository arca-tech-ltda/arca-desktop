import { app } from 'electron'
import type { UpdateStatus } from '../shared/update-status-types'
import {
  isMacInstallerReady,
  registerMacUpdaterEvents,
  resetMacInstallState
} from './updater-mac-install'
import { compareVersions } from './updater-fallback'
import type { ElectronAutoUpdater } from './electron-updater-loader'
import { recordUpdaterLifecycle } from './updater-lifecycle-diagnostics'
import {
  getRetainedLinuxPackageManualInstallStatus,
  resolveLinuxPackageDownloadedStatus,
  shouldIgnoreDownloadedUpdateEvent
} from './linux-package-downloaded-status'
import { isExternallyManagedLinuxInstall } from './linux-update-package-type'
import * as linuxPackageRecovery from './linux-package-update-recovery'

const AUTO_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

type UpdaterHandlerContext = {
  autoUpdater: ElectronAutoUpdater
  clearBackgroundCheckLaunchPending: () => void
  clearAvailableUpdateContext: () => void
  getCurrentStatus: () => UpdateStatus
  getActiveUpdateCheckEventAttemptId: () => number | null
  getKnownReleaseUrl: () => string | undefined
  getPendingInstallVersion: () => string
  getUserInitiatedCheck: () => boolean
  handleQuitAndInstallFailure: (error?: unknown) => boolean
  isQuitAndInstallHandoffActive: () => boolean
  hasInstallableDownloadedVersion: () => boolean
  shouldHandleUpdaterErrorEvent: () => boolean
  markUpdateCheckEventAttempt: () => boolean
  performQuitAndInstall: () => void | Promise<void>
  shouldDeferMacQuitForInstall: () => boolean
  recordCompletedUpdateCheck: () => void
  sendCheckFailureStatus: (
    message: string,
    userInitiated?: boolean,
    sourceError?: unknown
  ) => Promise<void>
  sendErrorStatus: (message: string, userInitiated?: boolean) => void
  sendStatus: (status: UpdateStatus) => void
  scheduleAutomaticUpdateCheck: (delayMs: number) => void
  setAvailableReleaseUrl: (releaseUrl: string | null) => void
  setAvailableVersion: (version: string | null) => void
  setUserInitiatedCheck: (value: boolean) => void
}

export function registerAutoUpdaterHandlers({
  autoUpdater,
  clearBackgroundCheckLaunchPending,
  clearAvailableUpdateContext,
  getCurrentStatus,
  getActiveUpdateCheckEventAttemptId,
  getKnownReleaseUrl,
  getPendingInstallVersion,
  getUserInitiatedCheck,
  handleQuitAndInstallFailure,
  isQuitAndInstallHandoffActive,
  hasInstallableDownloadedVersion,
  shouldHandleUpdaterErrorEvent,
  markUpdateCheckEventAttempt,
  performQuitAndInstall,
  shouldDeferMacQuitForInstall,
  recordCompletedUpdateCheck,
  sendCheckFailureStatus,
  sendErrorStatus,
  sendStatus,
  scheduleAutomaticUpdateCheck,
  setAvailableReleaseUrl,
  setAvailableVersion,
  setUserInitiatedCheck
}: UpdaterHandlerContext): void {
  registerMacUpdaterEvents({
    getCurrentStatus,
    hasInstallableDownloadedVersion,
    getPendingInstallVersion,
    getKnownReleaseUrl,
    performQuitAndInstall,
    shouldDeferMacQuitForInstall,
    sendStatus
  })

  autoUpdater.on('checking-for-update', () => {
    if (!markUpdateCheckEventAttempt()) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    clearAvailableUpdateContext()
    const wasUserInitiated = getUserInitiatedCheck()
    sendStatus({ state: 'checking', userInitiated: wasUserInitiated || undefined })
  })

  autoUpdater.on('update-available', (info) => {
    const attemptId = getActiveUpdateCheckEventAttemptId()
    if (attemptId === null) {
      return
    }
    clearBackgroundCheckLaunchPending()
    const wasUserInitiated = getUserInitiatedCheck()
    setUserInitiatedCheck(false)

    if (compareVersions(info.version, app.getVersion()) <= 0) {
      clearAvailableUpdateContext()
      recordCompletedUpdateCheck()
      if (!wasUserInitiated) {
        scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
      }
      sendStatus(
        getRetainedLinuxPackageManualInstallStatus() ?? {
          state: 'not-available',
          userInitiated: wasUserInitiated || undefined
        }
      )
      return
    }

    // Why: only a genuinely newer offer supersedes the retained package; a publishing-window blip that
    // momentarily resolves an older tag must not destroy a still-valid recovery path.
    linuxPackageRecovery.clearTrackedLinuxPackageArtifactForOtherVersion(info.version)

    if (getCurrentStatus().state !== 'checking' && getCurrentStatus().state !== 'idle') {
      return
    }
    setAvailableVersion(info.version)
    setAvailableReleaseUrl(null)
    recordCompletedUpdateCheck()
    if (!wasUserInitiated) {
      scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    }
    sendStatus(
      getRetainedLinuxPackageManualInstallStatus() ?? {
        state: 'available',
        releaseDate: info.releaseDate,
        version: info.version,
        changelog: null,
        ...(isExternallyManagedLinuxInstall() ? { externallyManaged: true } : {})
      }
    )
  })

  autoUpdater.on('update-not-available', () => {
    if (getActiveUpdateCheckEventAttemptId() === null) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    const retainedStatus = getRetainedLinuxPackageManualInstallStatus()
    const wasUserInitiated = getUserInitiatedCheck()
    setUserInitiatedCheck(false)
    clearAvailableUpdateContext()
    recordCompletedUpdateCheck()
    if (!wasUserInitiated) {
      scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    }
    // Why: a later check can report no newer release while a verified deb/rpm is still waiting for
    // the user to install it outside ARCA. Keep both the artifact and its recovery card reachable.
    sendStatus(
      retainedStatus ?? { state: 'not-available', userInitiated: wasUserInitiated || undefined }
    )
  })

  autoUpdater.on('download-progress', (progress) => {
    clearBackgroundCheckLaunchPending()
    const version = getPendingInstallVersion()
    linuxPackageRecovery.clearTrackedLinuxPackageArtifactForOtherVersion(version)
    sendStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      version
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    // Why: an earlier download can finish after a newer target replaced it; uncached pre-staged events have no target to compare.
    if (
      shouldIgnoreDownloadedUpdateEvent(
        getCurrentStatus(),
        info.version,
        getPendingInstallVersion()
      )
    ) {
      return
    }
    clearBackgroundCheckLaunchPending()
    if (compareVersions(info.version, app.getVersion()) <= 0) {
      clearAvailableUpdateContext()
      linuxPackageRecovery.clearTrackedLinuxPackageArtifact()
      sendStatus({ state: 'not-available' })
      return
    }
    const macInstallerReady = process.platform === 'darwin' ? isMacInstallerReady() : true
    recordUpdaterLifecycle('update_downloaded', { version: info.version, macInstallerReady })
    const linuxPackageStatus = resolveLinuxPackageDownloadedStatus(info)
    if (linuxPackageStatus) {
      sendStatus(linuxPackageStatus)
      return
    }
    // On macOS, defer 'downloaded' until Squirrel.Mac finishes processing; other platforms are ready immediately.
    if (process.platform === 'darwin' && !macInstallerReady) {
      // Keep the UI at 100% downloaded while Squirrel processes, to avoid a premature "ready to install".
      recordUpdaterLifecycle('macos_waiting_for_squirrel', { version: info.version })
      sendStatus({ state: 'downloading', percent: 100, version: info.version })
      return
    }
    sendStatus({ state: 'downloaded', version: info.version, releaseUrl: getKnownReleaseUrl() })
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message ?? 'Unknown error'
    // Why: quitAndInstall reports "no staged update" via this error event (async on macOS); recover quit flags before suppression guards run.
    if (handleQuitAndInstallFailure(err)) {
      return
    }
    // Why: handoff still owns the process; don't treat as a check/download error.
    if (isQuitAndInstallHandoffActive()) {
      return
    }
    if (!shouldHandleUpdaterErrorEvent()) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    const wasUserInitiated = getUserInitiatedCheck()
    setUserInitiatedCheck(false)
    if (getCurrentStatus().state === 'checking') {
      void sendCheckFailureStatus(message, wasUserInitiated || undefined, err)
      return
    }
    sendErrorStatus(message, wasUserInitiated || undefined)
  })
}
