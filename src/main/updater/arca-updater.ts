import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { UpdateCheckOptions, UpdateStatus } from '../../shared/update-status-types'
import { UpdaterSetup, type UpdaterSetupOptions } from './updater-setup'
import { ArcaMacUpdate } from './arca-mac-update'
import { MEGAMIND_UPDATE_REQUIRED, readArcaUpdateFeed } from './arca-update-feed'
import { AUTO_UPDATE_CHECK_INTERVAL_MS } from './updater-state'

/** Keeps the upstream status/install machinery, but admits only the ARCA stable feed. */
export class ArcaUpdater extends UpdaterSetup {
  private readonly mac = new ArcaMacUpdate((status) => this.sendStatus(status))
  private macStarted = false

  override setupAutoUpdater(window: BrowserWindow, options?: UpdaterSetupOptions): void {
    this.mainWindowRef = window
    this.onBeforeQuitCleanup = options?.onBeforeQuit ?? null
    this.updateInstallMode = options?.installMode ?? 'interactive'
    if (!app.isPackaged) {
      return
    }
    if (process.platform === 'darwin') {
      if (this.updateInstallMode !== 'interactive') {
        return
      }
      if (this.macStarted) {
        return
      }
      this.macStarted = true
      setTimeout(() => this.checkForUpdates(), 30_000).unref()
      setInterval(() => this.checkForUpdates(), AUTO_UPDATE_CHECK_INTERVAL_MS).unref()
    } else if (process.platform === 'win32') {
      super.setupAutoUpdater(window, options)
    }
    void readArcaUpdateFeed().then((feed) => {
      if (!feed && this.currentStatus.state === 'idle') {
        this.sendStatus({ state: 'error', message: MEGAMIND_UPDATE_REQUIRED, retryable: true })
      }
    })
  }

  override checkForUpdates(): void {
    if (!app.isPackaged) {
      return
    }
    if (process.platform === 'darwin') {
      void this.mac.check(false)
    } else if (process.platform === 'win32') {
      super.checkForUpdates()
    }
  }

  override checkForUpdatesFromMenu(_options?: UpdateCheckOptions): void {
    if (
      !app.isPackaged ||
      this.currentStatus.state === 'downloading' ||
      this.currentStatus.state === 'downloaded'
    ) {
      return
    }
    if (process.platform === 'darwin') {
      void this.mac.check(true)
    } else if (process.platform === 'win32') {
      super.checkForUpdatesFromMenu()
    }
  }

  override downloadUpdate(): void {
    if (process.platform === 'darwin') {
      void this.mac.check(true)
    } else if (process.platform === 'win32') {
      super.downloadUpdate()
    }
  }

  override quitAndInstall(): void {
    if (process.platform !== 'darwin') {
      super.quitAndInstall()
      return
    }
    if (this.currentStatus.state !== 'downloaded' || this.quittingForUpdate) {
      return
    }
    this.quittingForUpdate = true
    void this.mac
      .install(() => this.runBeforeUpdateQuitCleanup())
      .catch(() => {
        this.quittingForUpdate = false
        this.sendStatus({
          state: 'error',
          message: 'Não foi possível reiniciar para atualizar.',
          retryable: true
        })
      })
  }

  protected override runBackgroundUpdateCheck(): boolean {
    if (this.currentStatus.state === 'downloading' || this.currentStatus.state === 'downloaded') {
      return false
    }
    return super.runBackgroundUpdateCheck()
  }

  protected override sendStatus(status: UpdateStatus, options?: { force?: boolean }): void {
    super.sendStatus(status, options)
    if (status.state === 'available' && process.platform === 'win32') {
      queueMicrotask(() => this.downloadUpdate())
    }
  }

  protected override scheduleAutomaticUpdateCheck(delay: number): void {
    super.scheduleAutomaticUpdateCheck(delay === 30_000 ? delay : AUTO_UPDATE_CHECK_INTERVAL_MS)
  }

  protected override async checkForUpdateNudge(): Promise<void> {}
  protected override scheduleUpdateNudgeCheck(): void {}
}
