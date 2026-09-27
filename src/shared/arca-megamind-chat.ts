/** Wire shapes of the Megamind chat (Mainframe contract v5.1), shared by main, preload and renderer. */

export const MEGAMIND_GROUP_CHANNEL = 'arca'

/** `arca` or `dm:<idA>:<idB>` with PocketBase record ids. */
export function isMegamindChannelId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === MEGAMIND_GROUP_CHANNEL || /^dm:[a-z0-9]{15}:[a-z0-9]{15}$/.test(value))
  )
}

export type MegamindChatChannel = {
  channel: string
  kind: 'group' | 'dm'
  /** Partner handle on a DM; empty on the group. */
  handle: string
  name: string
  lastMessageAt: string
  unread: number
}

export type MegamindChatMessage = {
  id: string
  channel: string
  authorKind: 'human' | 'agent'
  /** Author handle, as the server denormalizes it. */
  authorName: string
  authorLabel: string
  body: string
  mentions: string[]
  createdAt: string
  mine: boolean
}

/**
 * `login` = the Mainframe session in the app's partition has no PocketBase user;
 * `unsupported` = the paired server predates chat (v4).
 */
export type MegamindChatAvailability = 'loading' | 'ready' | 'login' | 'unsupported' | 'error'

export type MegamindChatState = {
  availability: MegamindChatAvailability
  /** Handle of the signed-in human, used for mention highlighting and self-checks. */
  viewerHandle: string
  activeChannel: string
  channels: MegamindChatChannel[]
  /** History of `activeChannel`, oldest first. */
  messages: MegamindChatMessage[]
}

export type MegamindMemberSession = {
  sessionId: string
  label: string
  project: string
  harness: string
  note: string
  lastSeen: string
}

export type MegamindMember = {
  handle: string
  name: string
  /** Has an agent session that can be woken. */
  online: boolean
  /** Has the ARCA desktop app open. */
  appOnline: boolean
  sessions: MegamindMemberSession[]
}

export type MegamindMembers = {
  items: MegamindMember[]
  /** `list_agents` fallback on a v4 server: sessions are known, `app_online` is inferred. */
  degraded: boolean
}

/** Why a post did not land. `tooLong` covers every body the server rejected as malformed. */
export type MegamindChatPostFailure =
  | 'login'
  | 'unsupported'
  | 'forbidden'
  | 'rate'
  | 'tooLong'
  | 'error'

/** One `@handle-pi` mention the server tried to wake. */
export type MegamindChatWake = { handle: string; woken: boolean }

export type MegamindChatPostResult =
  | { status: 'ok'; woken: MegamindChatWake[] }
  | { status: MegamindChatPostFailure }

export const emptyMegamindChatState = (): MegamindChatState => ({
  availability: 'loading',
  viewerHandle: '',
  activeChannel: MEGAMIND_GROUP_CHANNEL,
  channels: [],
  messages: []
})
