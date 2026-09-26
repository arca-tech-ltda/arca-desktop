import { UpdaterMenuChecks } from './updater-menu-checks'

/** Preserves dismissal actions for existing renderer and runtime callers. */
export abstract class UpdaterNudge extends UpdaterMenuChecks {
  protected dismissNudge(): void {
    const pendingId = this.activeUpdateNudgeId ?? this._getPendingUpdateNudgeId?.() ?? null
    if (pendingId) {
      this._setDismissedUpdateNudgeId?.(pendingId)
      this.clearPendingUpdateNudge()
    }
  }

  // Kept for existing renderer/remote callers; ARCA has no pinned offer to abandon.
  protected dismissAvailableUpdate(): void {}
}
