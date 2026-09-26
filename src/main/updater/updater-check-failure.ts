import { isBenignCheckFailure } from '../updater-fallback'
import { arcaUpdateFeedUnavailableMessage } from './arca-update-feed-failure'
import { UpdaterReleaseFeed } from './updater-release-feed'

/** Normalizes check failures, retry policy, and release-feed preflight diagnostics. */
export abstract class UpdaterCheckFailure extends UpdaterReleaseFeed {
  protected async sendCheckFailureStatus(
    message: string,
    userInitiated?: boolean,
    sourceError?: unknown
  ): Promise<void> {
    const failureKey = this.getCheckFailureKey(message, userInitiated)
    if (this.pendingCheckFailureKey === failureKey && this.pendingCheckFailurePromise) {
      return this.pendingCheckFailurePromise
    }

    const handleFailure = async (): Promise<void> => {
      const feedUnavailableMessage = arcaUpdateFeedUnavailableMessage(sourceError ?? message)
      if (feedUnavailableMessage) {
        console.warn('[updater] update feed unavailable:', message)
        this.clearAvailableUpdateContext()
        this.scheduleAutomaticUpdateCheck(this.getAutomaticRetryInterval())
        this.sendSettledCheckStatus(
          userInitiated
            ? { state: 'error', message: feedUnavailableMessage, userInitiated: true }
            : { state: 'idle' }
        )
        return
      }
      if (isBenignCheckFailure(message)) {
        // Why: benign failures (incomplete latest.yml, network blips) are transient — retry, and skip persisting the timestamp (would suppress the next startup check).
        console.warn('[updater] benign check failure:', message)
        this.clearAvailableUpdateContext()
        this.scheduleAutomaticUpdateCheck(this.getAutomaticRetryInterval())
        if (userInitiated) {
          // Why: a user click needs visible feedback (idle looks broken); distinguish incomplete releases from transport failures.
          this.sendSettledCheckStatus({
            state: 'error',
            message: "Couldn't reach the update server. Try again in a few minutes.",
            userInitiated: true
          })
        } else {
          this.sendSettledCheckStatus({ state: 'idle' })
        }
        return
      }
      this.clearAvailableUpdateContext()
      this.persistLastUpdateCheckAt?.(Date.now())
      if (!userInitiated) {
        this.scheduleAutomaticUpdateCheck(this.getAutomaticRetryInterval())
      }
      this.sendSettledCheckStatus({ state: 'error', message, userInitiated })
    }

    this.pendingCheckFailureKey = failureKey
    this.pendingCheckFailurePromise = handleFailure().finally(() => {
      if (this.pendingCheckFailureKey === failureKey) {
        this.pendingCheckFailureKey = null
        this.pendingCheckFailurePromise = null
      }
    })
    return this.pendingCheckFailurePromise
  }

  /** Keeps retry interval access in one place for the scheduling layer. */
  protected abstract getAutomaticRetryInterval(): number
}
