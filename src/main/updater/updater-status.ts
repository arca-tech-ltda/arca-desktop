import { loadElectronAutoUpdater, type ElectronAutoUpdater } from '../electron-updater-loader'
import { statusesEqual } from '../updater-fallback'
import type { UpdateStatus } from '../../shared/update-status-types'
import { UpdaterState as BaseUpdaterState } from './updater-state'

export abstract class UpdaterStatus extends BaseUpdaterState {
  protected getAutoUpdater(): ElectronAutoUpdater {
    if (!this.autoUpdater) {
      this.autoUpdater = loadElectronAutoUpdater()
    }
    return this.autoUpdater
  }

  protected clearAvailableUpdateContext(): void {
    this.availableVersion = null
    this.availableReleaseUrl = null
  }

  protected clearPendingUpdateNudge(): void {
    this.activeUpdateNudgeId = null
    this._setPendingUpdateNudgeId?.(null)
  }

  protected getPersistedPendingUpdateNudgeId(): string | null {
    return this._getPendingUpdateNudgeId?.() ?? null
  }

  protected decorateStatusWithActiveNudge(status: UpdateStatus): UpdateStatus {
    // Why: only actionable/error states carry the nudge marker so the renderer knows a dismiss should ack the campaign; cycle-boundary states never need it.
    if (!this.activeUpdateNudgeId) {
      return status
    }
    if (
      status.state === 'idle' ||
      status.state === 'checking' ||
      status.state === 'not-available'
    ) {
      return status
    }
    return { ...status, activeNudgeId: this.activeUpdateNudgeId }
  }

  /** `force` re-delivers a status the renderer must not miss even when it repeats the current one. */
  protected sendStatus(status: UpdateStatus, options?: { force?: boolean }): void {
    const decoratedStatus = this.decorateStatusWithActiveNudge(status)

    if (this.isUpdateCheckResultState(status.state)) {
      this.finishActiveUpdateCheckAttempt()
    }

    // Why: reset the in-flight guard once status moves past the window where duplicate download() calls are possible.
    if (
      decoratedStatus.state === 'downloading' ||
      decoratedStatus.state === 'error' ||
      decoratedStatus.state === 'idle'
    ) {
      this.downloadInFlight = false
    }
    if (!options?.force && statusesEqual(this.currentStatus, decoratedStatus)) {
      return
    }
    this.currentStatus = decoratedStatus
    this.mainWindowRef?.webContents.send('updater:status', decoratedStatus)
  }

  protected abstract finishActiveUpdateCheckAttempt(): void
  protected abstract isUpdateCheckResultState(state: UpdateStatus['state']): boolean
  protected abstract checkForUpdatesFromMenu(): void
}
