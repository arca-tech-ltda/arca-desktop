import type { BrowserWindow } from 'electron'
import type { ElectronAutoUpdater } from '../electron-updater-loader'
import type { UpdateStatus } from '../../shared/update-status-types'

export const AUTO_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
export const AUTO_UPDATE_RETRY_INTERVAL_MS = 60 * 60 * 1000
// Why: a persistently-failing feed used to re-arm the retry at a fixed 1h cadence forever (issue #7576); backoff doubles per failure up to this cap, any completed check resets.
export const MAX_AUTO_UPDATE_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000
export const QUIT_AND_INSTALL_DELAY_MS = 100
export const PRE_QUIT_CLEANUP_TIMEOUT_MS = 2_500
export const UPDATE_CHECK_SILENT_SETTLE_DELAY_MS = 1_000
export const UPDATE_CHECK_STALL_TIMEOUT_MS = 45_000

export type UpdateInstallMode =
  | 'interactive'
  | 'supervised-headless-serve'
  | 'unsupported-headless-serve'

export abstract class UpdaterState {
  protected mainWindowRef: BrowserWindow | null = null
  protected currentStatus: UpdateStatus = { state: 'idle' }
  protected userInitiatedCheck = false
  protected onBeforeQuitCleanup: (() => void | Promise<void>) | null = null
  protected autoUpdaterInitialized = false
  protected availableVersion: string | null = null
  protected availableReleaseUrl: string | null = null
  protected pendingCheckFailureKey: string | null = null
  protected pendingCheckFailurePromise: Promise<void> | null = null
  protected autoUpdateCheckTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingQuitAndInstallTimer: ReturnType<typeof setTimeout> | null = null
  protected quitAndInstallInProgress = false
  protected updateInstallMode: UpdateInstallMode = 'interactive'
  protected lastInstallDeferralVersion = {
    download: null as string | null,
    install: null as string | null
  }
  // Why: once install has committed, late 'error' events must not clear quittingForUpdate — that would re-enable dock activate mid-installer.
  protected updateInstallCommitted = false
  // Why: recovery must only run after the native quitAndInstall call; pre-native errors must not clear quittingForUpdate or look like install recovery.
  protected quitAndInstallNativeInvoked = false
  protected persistLastUpdateCheckAt: ((timestamp: number) => void) | null = null
  protected _getLastUpdateCheckAt: (() => number | null) | null = null
  protected backgroundCheckLaunchPending = false
  // Why: a promoted background check can emit an error event before its promise catch runs; keep the promotion attached to that launch.
  protected backgroundCheckPromotedToUserInitiated = false
  protected updateCheckStallTimer: ReturnType<typeof setTimeout> | null = null
  protected updateCheckSilentSettleTimer: ReturnType<typeof setTimeout> | null = null
  protected updateCheckAttemptSequence = 0
  protected activeUpdateCheckAttemptId: number | null = null
  protected activeUpdateCheckLaunchAttemptId: number | null = null
  protected activeUpdateCheckEventAttemptId: number | null = null
  protected activeUpdateNudgeId: string | null = null
  protected _getPendingUpdateNudgeId: (() => string | null) | null = null
  protected _setPendingUpdateNudgeId: ((id: string | null) => void) | null = null
  protected _setDismissedUpdateNudgeId: ((id: string | null) => void) | null = null
  // Why: guards against duplicate download() calls while an accepted request transitions status to 'downloading'.
  protected downloadInFlight = false
  /** Guards the macOS `activate` handler from reopening the old version while ShipIt replaces the .app bundle. */
  protected quittingForUpdate = false
  protected autoUpdater: ElectronAutoUpdater | null = null
  protected consecutiveAutomaticRetrySchedules = 0
  protected readonly installFailureCauseMaxLength = 200

  constructor() {}
}
