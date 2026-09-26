import { Notification } from 'electron'
import { activeNotifications, logNativeNotificationFailure } from './native-notification-lifecycle'
import {
  readNotificationAuthorizationStatus,
  requestNotificationAuthorization
} from './notification-authorization-status'
import { recordNotificationDeliveryOutcome } from './notification-permission-probe'
import { openNotificationSystemSettings } from './notification-system-settings-link'

// Why not the whole Store: these two operations are all this needs, and a narrow surface keeps callers and tests cast-free.
type NotificationPermissionStore = {
  getUI: () => { notificationPermissionRequested?: boolean }
  updateUI: (updates: { notificationPermissionRequested: boolean }) => void
}

/**
 * On first launch, ask macOS for notification authorization once, then show a welcome notification.
 *
 * Why the explicit request: only UNUserNotificationCenter.requestAuthorization raises the system
 * prompt; scheduling a notification never does, so an undecided app stays undecided forever.
 */
export async function triggerStartupNotificationRegistration(
  store: NotificationPermissionStore
): Promise<void> {
  if (process.platform !== 'darwin' || !Notification.isSupported()) {
    return
  }
  // Why: fire once per install, not on every launch where status stays not-determined (e.g. user dismisses the dialog).
  const ui = store.getUI()
  if (ui.notificationPermissionRequested) {
    return
  }
  store.updateUI({ notificationPermissionRequested: true })

  if ((await readNotificationAuthorizationStatus()) === 'not-determined') {
    await requestNotificationAuthorization()
  }

  const notification = new Notification({
    title: 'ARCA is ready to notify you',
    body: 'Allow notifications so ARCA can alert you when agents finish or terminals need attention.'
  })

  // Why: prevent GC from collecting the notification and its click handler while it's still visible.
  activeNotifications.add(notification)

  let handled = false
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  function clearStartupTimers(): void {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function cleanup(): void {
    if (handled) {
      return
    }
    handled = true
    clearStartupTimers()
    activeNotifications.delete(notification)
    notification.removeListener('click', onClick)
    notification.removeListener('show', onShow)
    notification.removeListener('failed', onFailed)
    notification.close()
  }

  // Why: the body reads like an actionable "Allow notifications…" prompt, so clicking opens macOS Notification Settings.
  function onClick(): void {
    cleanup()
    openNotificationSystemSettings()
  }

  function onShow(): void {
    // Why: close after a delay so the banner doesn't linger; the macOS permission sheet is separate and unaffected.
    closeTimer = setTimeout(cleanup, 8000)
    if (typeof closeTimer.unref === 'function') {
      closeTimer.unref()
    }
  }

  function onFailed(_event: unknown, error?: string): void {
    // Why: Electron 42 requires code-signed macOS apps for UNNotification delivery; unsigned builds fail here.
    logNativeNotificationFailure('startup registration', error)
    recordNotificationDeliveryOutcome('failed')
    cleanup()
  }

  notification.on('click', onClick)
  notification.on('show', onShow)
  notification.on('failed', onFailed)

  // Fallback in case macOS doesn't fire the 'show' event (e.g. user denies).
  fallbackTimer = setTimeout(cleanup, 10_000)
  if (typeof fallbackTimer.unref === 'function') {
    fallbackTimer.unref()
  }

  notification.show()
}
