import { readArcaUpdateFeed, MEGAMIND_UPDATE_REQUIRED } from './arca-update-feed'
import type { CheckFailureSource } from './updater-state'
import type { UpdateCheckVariant } from './updater-types'
import { UpdaterInstallExecution } from './updater-install-execution'

/** Owns concrete release-feed pinning and the one-shot prerelease fallback. */
export abstract class UpdaterReleaseFeed extends UpdaterInstallExecution {
  protected clearPrereleaseFallbackContextIfSettled(): void {
    if (
      this.pendingPrereleaseFallback?.fallbackResultHandled &&
      !this.pendingPrereleaseFallback.suppressedPrimaryPromiseFailureKey &&
      !this.pendingPrereleaseFallback.suppressedPrimaryEventFailure &&
      !this.pendingPrereleaseFallback.suppressedFallbackPromiseFailureKey &&
      !this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey
    ) {
      this.clearPrereleaseFallbackContext()
    }
  }

  protected getMissingManifestPrereleaseFallbackUserInitiated(): boolean | null {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return null
    }
    return this.pendingPrereleaseFallback.userInitiated
  }

  protected markMissingManifestPrereleaseFallbackChecking(): void {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.fallbackCheckingForUpdateSeen = true
  }

  protected consumeMissingManifestPrereleaseFallbackResult(): { userInitiated: boolean } | null {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return null
    }
    const result = { userInitiated: this.pendingPrereleaseFallback.userInitiated }
    this.pendingPrereleaseFallback.fallbackResultHandled = true
    this.clearPrereleaseFallbackContextIfSettled()
    return result
  }

  protected suppressMissingManifestPrereleaseFallbackPromiseFailure(message: string): void {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.suppressedFallbackPromiseFailureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
  }

  protected shouldSuppressMissingManifestPrereleaseFallbackEvent(
    message: string,
    error: unknown
  ): boolean {
    if (!this.pendingPrereleaseFallback?.retryLaunched) {
      return false
    }
    const failureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
    const primaryEventSuppression = this.pendingPrereleaseFallback.suppressedPrimaryEventFailure
    if (primaryEventSuppression?.failureKey === failureKey) {
      const isPrimaryPromisePair = primaryEventSuppression.error === error
      // Why: after fallback checking starts, same-message errors may be the fallback's, so message matching alone isn't safe.
      if (isPrimaryPromisePair || !this.pendingPrereleaseFallback.fallbackCheckingForUpdateSeen) {
        this.pendingPrereleaseFallback.suppressedPrimaryEventFailure = null
        this.clearPrereleaseFallbackContextIfSettled()
        return true
      }
    }
    if (this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey === failureKey) {
      this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey = null
      this.clearPrereleaseFallbackContextIfSettled()
      return true
    }
    return false
  }

  protected markMissingManifestPrereleaseFallbackPromiseHandled(message: string): void {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
  }

  protected async pinDefaultReleaseFeed(
    _variant: UpdateCheckVariant = 'default'
  ): Promise<'ready' | 'not-available'> {
    const feed = await readArcaUpdateFeed()
    if (!feed) {
      throw new Error(MEGAMIND_UPDATE_REQUIRED)
    }
    const updater = this.getAutoUpdater()
    updater.requestHeaders = feed.requestHeaders
    updater.allowPrerelease = false
    updater.setFeedURL(feed)
    this.clearPrereleaseFallbackContext()
    return 'ready'
  }

  protected retryPrereleaseFallbackAfterMissingManifest(
    _message: string,
    _userInitiated: boolean | undefined,
    _source: CheckFailureSource,
    _failureKey: string,
    _sourceError?: unknown
  ): boolean {
    return false
  }
}
