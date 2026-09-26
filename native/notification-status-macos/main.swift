// Prints the app's macOS notification settings as JSON and exits. With
// --request it first asks UNUserNotificationCenter for authorization, which is
// the only call that shows the macOS permission prompt — Electron's
// Notification.show() never asks, so without this the app stays undecided.
//
// Why this exists: Electron exposes no API for UNUserNotificationCenter
// authorization, and scheduling silently succeeds even while macOS suppresses
// display, so the renderer cannot know whether the user actually receives
// notifications. This binary must run from inside the app bundle (NSBundle
// resolves the bundle by walking up from the executable path) and must be
// code-signed with the app's identifier — macOS keys notification records to
// the signing identifier, which is why the build embeds an Info.plist section
// with the target CFBundleIdentifier.
import Foundation
import UserNotifications

// Why so long: the prompt stays up until the user answers, and macOS records a
// denial if the asking process dies first.
let requestTimeoutSeconds = 300.0
if CommandLine.arguments.contains("--request") {
  let requestSemaphore = DispatchSemaphore(value: 0)
  UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) {
    _, _ in
    requestSemaphore.signal()
  }
  _ = requestSemaphore.wait(timeout: .now() + requestTimeoutSeconds)
}

let semaphore = DispatchSemaphore(value: 0)
var authorization = "unknown"
var alert = "unknown"
UNUserNotificationCenter.current().getNotificationSettings { settings in
  switch settings.authorizationStatus {
  case .authorized: authorization = "authorized"
  case .provisional: authorization = "provisional"
  case .ephemeral: authorization = "ephemeral"
  case .denied: authorization = "denied"
  case .notDetermined: authorization = "not-determined"
  @unknown default: authorization = "unknown"
  }
  switch settings.alertSetting {
  case .enabled: alert = "enabled"
  case .disabled: alert = "disabled"
  case .notSupported: alert = "not-supported"
  @unknown default: alert = "unknown"
  }
  semaphore.signal()
}
_ = semaphore.wait(timeout: .now() + 3)
print("{\"authorization\":\"\(authorization)\",\"alert\":\"\(alert)\"}")
