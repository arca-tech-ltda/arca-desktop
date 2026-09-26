import { readArcaUpdateFeed, MEGAMIND_UPDATE_REQUIRED } from './arca-update-feed'
import { UpdaterInstallExecution } from './updater-install-execution'

/** Pins electron-updater to the authenticated ARCA feed. */
export abstract class UpdaterReleaseFeed extends UpdaterInstallExecution {
  protected async pinDefaultReleaseFeed(): Promise<void> {
    const feed = await readArcaUpdateFeed()
    if (!feed) {
      throw new Error(MEGAMIND_UPDATE_REQUIRED)
    }
    const updater = this.getAutoUpdater()
    updater.requestHeaders = feed.requestHeaders
    updater.allowPrerelease = false
    updater.setFeedURL(feed)
  }
}
