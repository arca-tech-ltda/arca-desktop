import { translate } from '@/i18n/i18n'
import type {
  MegamindMember,
  MegamindSessionStatus
} from '../../../../../shared/arca-megamind-chat'

/**
 * What the dot next to a person or a session says. `app` is ARCA open with no agent to wake, which
 * still reaches the person — a message lands in their inbox and their app notifies them.
 */
export type MegamindPresenceState = 'working' | 'idle' | 'app' | 'away'

export function megamindSessionState(status: MegamindSessionStatus): MegamindPresenceState {
  if (status === 'active') {
    return 'working'
  }
  return status === 'idle' ? 'idle' : 'away'
}

export function megamindMemberState(member: MegamindMember): MegamindPresenceState {
  if (member.sessions.some((session) => session.status === 'active')) {
    return 'working'
  }
  if (member.online || member.sessions.some((session) => session.status === 'idle')) {
    return 'idle'
  }
  return member.appOnline ? 'app' : 'away'
}

export function megamindPresenceLabel(state: MegamindPresenceState): string {
  switch (state) {
    case 'working':
      return translate('arca.megamind.presenceWorking', 'working')
    case 'idle':
      return translate('arca.megamind.presenceIdle', 'idle')
    case 'app':
      return translate('arca.megamind.presenceAppOnly', 'app only')
    case 'away':
      return translate('arca.megamind.presenceAway', 'away')
  }
}

/** First letter of the name shown inside an avatar; the handle is the fallback. */
export function megamindInitial(name: string, handle: string): string {
  return (name.trim() || handle).charAt(0).toUpperCase()
}
