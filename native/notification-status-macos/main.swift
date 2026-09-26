// Prints the app's macOS notification settings as JSON and exits. With
// --request it first asks UNUserNotificationCenter for authorization, which is
// the only call that registers the app with the Notification Center and puts it
// in System Settings › Notifications — Electron's Notification.show() never
// asks, so without this the app stays undecided and every banner is dropped.
//
// Why this exists: Electron exposes no API for UNUserNotificationCenter
// authorization, and scheduling silently succeeds even while macOS suppresses
// display, so the renderer cannot know whether the user actually receives
// notifications. This binary must run from inside the app bundle (NSBundle
// resolves the bundle by walking up from the executable path) and must be
// code-signed with the app's identifier — macOS keys notification records to
// the signing identifier, which is why the build embeds an Info.plist section
// with the target CFBundleIdentifier.
import AppKit
import Foundation
import UserNotifications

func readSettings(_ report: @escaping (String, String) -> Void) {
  UNUserNotificationCenter.current().getNotificationSettings { settings in
    var authorization = "unknown"
    var alert = "unknown"
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
    report(authorization, alert)
  }
}

func printSettings(_ authorization: String, _ alert: String) {
  print("{\"authorization\":\"\(authorization)\",\"alert\":\"\(alert)\"}")
}

if CommandLine.arguments.contains("--request") {
  // Why AppKit: usernoted refuses requestAuthorization from a process with no
  // AppKit connection — it answers UNErrorDomain 1 immediately, with no prompt
  // and no registration. Verified on macOS 26: the identical binary succeeds
  // with an NSApplication run loop and fails without one. `.accessory` keeps it
  // out of the Dock and never takes focus.
  let application = NSApplication.shared
  application.setActivationPolicy(.accessory)

  // Why no deadline: macOS records a denial when the asking process dies with the
  // prompt still open, so the only safe exits are the authorization callback and
  // an answer observed in the settings (e.g. decided from System Settings).
  let decisionPollSeconds = 30.0
  func exitOnceDecided() {
    DispatchQueue.main.asyncAfter(deadline: .now() + decisionPollSeconds) {
      readSettings { authorization, alert in
        guard authorization == "not-determined" || authorization == "unknown" else {
          printSettings(authorization, alert)
          exit(0)
        }
        exitOnceDecided()
      }
    }
  }
  exitOnceDecided()
  DispatchQueue.main.async {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) {
      _, _ in
      readSettings { authorization, alert in
        printSettings(authorization, alert)
        exit(0)
      }
    }
  }
  application.run()
}

let semaphore = DispatchSemaphore(value: 0)
var finalAuthorization = "unknown"
var finalAlert = "unknown"
readSettings { authorization, alert in
  finalAuthorization = authorization
  finalAlert = alert
  semaphore.signal()
}
_ = semaphore.wait(timeout: .now() + 3)
printSettings(finalAuthorization, finalAlert)
