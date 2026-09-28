import type {
  MegamindMember,
  MegamindMembers,
  MegamindMemberSession,
  MegamindSessionStatus
} from '../../shared/arca-megamind-chat'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { object } from './credentials'
import { records } from './gateway'

/** The presence window the server uses for "active" (contract §2.3). */
const ACTIVE_MS = 120_000
/** The window a session that declared itself idle stays wakeable. */
const IDLE_MS = 600_000
const DESKTOP_NOTE = 'Desktop inbox; no agent execution'

/** The ARCA app announces presence, not an agent: `harness: "desktop"`, or the pre-5.1 shape. */
export function isDesktopSession(session: { harness: string; note: string }): boolean {
  return (
    session.harness === 'desktop' || (session.harness === 'pi' && session.note === DESKTOP_NOTE)
  )
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** A server older than the idle field says nothing, so the age decides, as it always did. */
function toStatus(value: MegamindRecord, lastSeen: string, now: number): MegamindSessionStatus {
  const status = text(value.status)
  if (status === 'active' || status === 'idle' || status === 'recent') {
    return status
  }
  const age = now - Date.parse(lastSeen)
  if (!Number.isFinite(age)) {
    return 'recent'
  }
  if (value.idle === true) {
    return age <= IDLE_MS ? 'idle' : 'recent'
  }
  return age <= ACTIVE_MS ? 'active' : 'recent'
}

function toSession(value: MegamindRecord, now: number): MegamindMemberSession {
  const lastSeen = text(value.last_seen)
  return {
    sessionId: text(value.session_id),
    label: text(value.label),
    project: text(value.project) || text(value.project_id),
    harness: text(value.harness),
    note: text(value.note),
    lastSeen,
    status: toStatus(value, lastSeen, now)
  }
}

/** Wakeable: working, or idle at the keyboard. The server counts both as `online`. */
function isReachable(session: MegamindMemberSession): boolean {
  return session.status !== 'recent'
}

function toMember(value: MegamindRecord, now: number): MegamindMember | null {
  const handle = text(value.handle)
  if (!handle) {
    return null
  }
  return {
    handle,
    name: text(value.name) || handle,
    online: value.online === true,
    appOnline: value.app_online === true,
    sessions: records({ items: value.sessions }).map((session) => toSession(session, now))
  }
}

/**
 * People and their sessions. `chat_members` (v5.1) is the authority; a v4 server has no such tool,
 * so the sessions from `list_agents` are grouped by owner and the two presences are inferred from
 * the harness — marked `degraded` so the panel does not present a guess as the server's answer.
 */
export async function fetchMegamindMembers(
  tool: (name: string, args: MegamindRecord) => Promise<MegamindRecord>,
  now: number = Date.now()
): Promise<MegamindMembers> {
  try {
    const items = records(await tool('chat_members', {}))
    return {
      items: items.map((item) => toMember(item, now)).filter((item) => item !== null),
      degraded: false
    }
  } catch {
    return { items: membersFromAgents(records(await tool('list_agents', {})), now), degraded: true }
  }
}

function membersFromAgents(agents: MegamindRecord[], now: number): MegamindMember[] {
  const members = new Map<string, MegamindMember>()
  for (const agent of agents) {
    if (!object(agent)) {
      continue
    }
    const handle = text(agent.owner_name)
    if (!handle) {
      continue
    }
    const session = toSession(agent, now)
    const member = members.get(handle) ?? {
      handle,
      name: handle,
      online: false,
      appOnline: false,
      sessions: []
    }
    member.sessions.push(session)
    if (isDesktopSession(session)) {
      member.appOnline = member.appOnline || session.status === 'active'
    } else {
      member.online = member.online || isReachable(session)
    }
    members.set(handle, member)
  }
  return [...members.values()].sort((a, b) => a.handle.localeCompare(b.handle))
}
