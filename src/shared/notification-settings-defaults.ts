import type { NotificationSettings } from './notification-settings-types'

/** What a computer that never opened the Notifications pane notifies about. */
export function getDefaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    agentTaskComplete: true,
    terminalBell: false,
    megamindChat: true,
    suppressWhenFocused: true,
    customSoundId: 'system',
    customSoundPath: null,
    customSoundVolume: 100
  }
}
