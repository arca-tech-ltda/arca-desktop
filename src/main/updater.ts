import type { BrowserWindow } from 'electron'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions,
  UpdateStatus
} from '../shared/update-status-types'
import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../shared/remote-server-update'
import type { ReleaseBuild, ReleaseChannel } from '../shared/release-channel'
import type { ReleaseBuildListOptions } from './updater-release-build-cache'
import type { UpdaterSetupOptions } from './updater/updater-setup'
import { ArcaUpdater } from './updater/arca-updater'
import type { UpdateInstallMode } from './updater/updater-state'
import { areAutoUpdatesEnabled } from './updater/auto-update-policy'

// Keep one service instance so all public API calls share updater state and event listeners.
const updater = new ArcaUpdater()

export type { UpdateInstallMode, UpdaterSetupOptions }

// Why tracked here: with updates disabled nothing behind this boundary ever publishes a status,
// so the renderer would sit on whatever it last saw after pressing "Check for updates".
let disabledUpdatesWindow: BrowserWindow | null = null
let disabledUpdatesStatus: UpdateStatus = { state: 'idle' }

function publishDisabledUpdateStatus(userInitiated: boolean): void {
  disabledUpdatesStatus = { state: 'not-available', userInitiated }
  if (disabledUpdatesWindow && !disabledUpdatesWindow.isDestroyed()) {
    disabledUpdatesWindow.webContents.send('updater:status', disabledUpdatesStatus)
  }
}

export function resolveUpdateInstallMode(isServeMode: boolean): UpdateInstallMode {
  return updater.resolveUpdateInstallMode(isServeMode)
}

export function getUpdateStatus(): UpdateStatus {
  return areAutoUpdatesEnabled() ? updater.getUpdateStatus() : disabledUpdatesStatus
}

export function getRemoteServerUpdateSupport(): RemoteServerUpdateSupport {
  const support = updater.getRemoteServerUpdateSupport()
  if (areAutoUpdatesEnabled()) {
    return support
  }
  return { ...support, automatic: false, reason: 'updater-unavailable' }
}

export function getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot {
  const snapshot = updater.getRemoteServerUpdaterSnapshot(runtimeId)
  if (areAutoUpdatesEnabled()) {
    return snapshot
  }
  return {
    ...snapshot,
    support: getRemoteServerUpdateSupport(),
    status: disabledUpdatesStatus
  }
}

export function checkForRemoteServerUpdate(
  runtimeId: string,
  options?: UpdateCheckOptions
): RemoteServerUpdaterSnapshot {
  if (!areAutoUpdatesEnabled()) {
    return getRemoteServerUpdaterSnapshot(runtimeId)
  }
  return updater.checkForRemoteServerUpdate(runtimeId, options)
}

export function downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot {
  if (!areAutoUpdatesEnabled()) {
    return getRemoteServerUpdaterSnapshot(runtimeId)
  }
  return updater.downloadRemoteServerUpdate(runtimeId)
}

export function installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult {
  if (!areAutoUpdatesEnabled()) {
    // Why this wording: it is the error remote clients already handle for "this host updates manually".
    throw new Error('remote_update_manual_required')
  }
  return updater.installRemoteServerUpdate(runtimeId)
}

export function checkForUpdates(): void {
  if (!areAutoUpdatesEnabled()) {
    publishDisabledUpdateStatus(false)
    return
  }
  updater.checkForUpdates()
}

export function checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
  if (!areAutoUpdatesEnabled()) {
    publishDisabledUpdateStatus(true)
    return
  }
  updater.checkForUpdatesFromMenu(options)
}

export function cancelUpdateDownload(): void {
  updater.cancelDownload()
}

export function downloadUpdate(): void {
  if (!areAutoUpdatesEnabled()) {
    publishDisabledUpdateStatus(true)
    return
  }
  updater.downloadUpdate()
}

export function quitAndInstall(): void {
  if (!areAutoUpdatesEnabled()) {
    return
  }
  updater.quitAndInstall()
}

export function isQuittingForUpdate(): boolean {
  return updater.isQuittingForUpdate()
}

export async function getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
  return updater.getLinuxPackageInstallInstructions()
}

export async function showLinuxPackage(): Promise<void> {
  return updater.showLinuxPackage()
}

export async function listAvailableReleaseBuilds(
  channel: ReleaseChannel,
  options?: ReleaseBuildListOptions
): Promise<ReleaseBuild[]> {
  if (!areAutoUpdatesEnabled()) {
    return []
  }
  return updater.listAvailableReleaseBuilds(channel, options)
}

export function dismissNudge(): void {
  updater.dismissNudge()
}

export function dismissAvailableUpdate(): void {
  updater.dismissAvailableUpdate()
}

export function setupAutoUpdater(mainWindow: BrowserWindow, opts?: UpdaterSetupOptions): void {
  if (!areAutoUpdatesEnabled()) {
    disabledUpdatesWindow = mainWindow
    return
  }
  updater.setupAutoUpdater(mainWindow, opts)
}
