import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type NotificationAuthorizationStatus = 'authorized' | 'denied' | 'not-determined' | 'unknown'

const HELPER_EXECUTABLE = 'orca-notification-status'
const HELPER_TIMEOUT_MS = 4000
// Why 0 (no kill): the prompt waits for the user, and macOS records a denial if
// the asking process dies first — killing the helper on a timer is exactly what
// turns an unanswered prompt into a permanent denial. The helper exits itself
// once the authorization is decided.
const HELPER_REQUEST_TIMEOUT_MS = 0

let cachedHelperPath: string | null | undefined

/**
 * Resolves the bundled notification-status helper binary.
 *
 * Why: the helper must live in Contents/MacOS next to the Electron executable
 * — NSBundle resolves the process's bundle by walking up from the executable
 * path, macOS keys notification records to that identity, and macOS 26 aborts
 * UNUserNotificationCenter for executables run from Contents/Resources
 * (#7929). Dev copies and packaged builds (extraFiles) both place it there.
 */
function resolveHelperPath(): string | null {
  if (cachedHelperPath !== undefined) {
    return cachedHelperPath
  }
  if (process.platform !== 'darwin') {
    cachedHelperPath = null
    return cachedHelperPath
  }
  const candidate = join(dirname(process.execPath), HELPER_EXECUTABLE)
  cachedHelperPath = existsSync(candidate) ? candidate : null
  return cachedHelperPath
}

/**
 * Reads the app's real macOS notification authorization via a helper binary
 * calling UNUserNotificationCenter.getNotificationSettings. Returns null when
 * the helper is unavailable or fails, so callers can fall back to weaker
 * delivery-probe evidence.
 *
 * Why a helper at all: Electron exposes no API for notification authorization
 * (scheduling silently succeeds even while macOS is suppressing display), so
 * the only truthful signal is the native settings read.
 */
let readInFlight: Promise<NotificationAuthorizationStatus | null> | null = null

export function readNotificationAuthorizationStatus(): Promise<NotificationAuthorizationStatus | null> {
  const helperPath = resolveHelperPath()
  if (!helperPath) {
    return Promise.resolve(null)
  }
  // Why: simultaneous agent completions across worktrees each consult the
  // readout — one in-flight helper run answers all of them.
  if (readInFlight) {
    return readInFlight
  }
  readInFlight = runStatusHelper(helperPath).finally(() => {
    readInFlight = null
  })
  return readInFlight
}

/**
 * Shows the macOS notification permission prompt once and resolves with the
 * resulting authorization.
 *
 * Why a helper and not Electron: Electron's Notification.show() never calls
 * UNUserNotificationCenter.requestAuthorization, so an undecided app is left
 * undecided and macOS reports 'denied' evidence for it forever.
 */
let requestInFlight: Promise<NotificationAuthorizationStatus | null> | null = null

export function requestNotificationAuthorization(): Promise<NotificationAuthorizationStatus | null> {
  const helperPath = resolveHelperPath()
  if (!helperPath) {
    return Promise.resolve(null)
  }
  if (requestInFlight) {
    return requestInFlight
  }
  requestInFlight = runStatusHelper(helperPath, ['--request'], HELPER_REQUEST_TIMEOUT_MS).finally(
    () => {
      requestInFlight = null
    }
  )
  return requestInFlight
}

function runStatusHelper(
  helperPath: string,
  args: string[] = [],
  timeout: number = HELPER_TIMEOUT_MS
): Promise<NotificationAuthorizationStatus | null> {
  return new Promise((resolve) => {
    execFile(helperPath, args, { timeout }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      try {
        const parsed = JSON.parse(String(stdout).trim()) as { authorization?: string }
        switch (parsed.authorization) {
          case 'authorized':
          case 'provisional':
          case 'ephemeral':
            resolve('authorized')
            return
          case 'denied':
            resolve('denied')
            return
          case 'not-determined':
            resolve('not-determined')
            return
          case undefined:
          default:
            resolve('unknown')
        }
      } catch {
        resolve(null)
      }
    })
  })
}
