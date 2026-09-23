import { session } from 'electron'
import {
  ARCA_MAINFRAME_PARTITION,
  isAllowedArcaMainframePermission
} from '../../shared/arca-mainframe'

/**
 * Installed before any Megamind guest attaches: a persistent partition keeps the Mainframe login,
 * and the device's camera, microphone, location and notifications are not part of that bargain.
 */
export function installArcaMainframeSessionPolicy(): void {
  const mainframeSession = session.fromPartition(ARCA_MAINFRAME_PARTITION)
  mainframeSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(isAllowedArcaMainframePermission(permission))
  })
  mainframeSession.setPermissionCheckHandler((_contents, permission) =>
    isAllowedArcaMainframePermission(permission)
  )
}

export function isArcaMainframeSession(candidate: Electron.Session): boolean {
  return candidate === session.fromPartition(ARCA_MAINFRAME_PARTITION)
}
