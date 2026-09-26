import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { UpdaterScheduling } from './updater-scheduling'

/** Handles checks initiated from the desktop menu. */
export abstract class UpdaterMenuChecks extends UpdaterScheduling {
  protected checkForUpdatesFromMenu(): void {
    if (!app.isPackaged || is.dev) {
      this.sendStatus({ state: 'not-available', userInitiated: true })
      return
    }
    const checkAlreadyInFlight =
      this.backgroundCheckLaunchPending || this.currentStatus.state === 'checking'
    this.userInitiatedCheck = true
    // Why: manual checks are nudge-independent; clear the marker so a later dismiss can't consume the campaign by accident.
    this.activeUpdateNudgeId = null
    // Why: respond visibly before feed pinning/updater events; duplicate broadcasts are suppressed by status equality below.
    this.sendStatus({ state: 'checking', userInitiated: true })
    if (checkAlreadyInFlight) {
      this.backgroundCheckPromotedToUserInitiated = true
      this.rearmActiveUpdateCheckStallTimer()
      return
    }

    const attemptId = this.beginUpdateCheckAttempt()
    const autoUpdater = this.getAutoUpdater()
    const launch = (): Promise<unknown> | undefined => {
      if (!this.isActiveUpdateCheckAttempt(attemptId)) {
        return undefined
      }
      this.markUpdateCheckLaunched(attemptId)
      return autoUpdater.checkForUpdates()
    }
    const run = this.pinDefaultReleaseFeed().then(launch)
    void Promise.resolve(run)
      .then(() => this.handleSettledUpdateCheckPromise(attemptId))
      .catch((err) => {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        this.userInitiatedCheck = false
        this.finishActiveUpdateCheckAttempt()
        void this.sendCheckFailureStatus(String(err?.message ?? err), true, err)
      })
  }
}
