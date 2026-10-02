import type { MegamindChatMessage } from '../../shared/arca-megamind-chat'
import {
  classifyMegamindChatAlert,
  type MegamindChatAlert
} from '../../shared/arca-megamind-notifications'

type MegamindChatActivityState = {
  seen: Set<string>
  seeded: boolean
  since: string
}

export function applyMegamindChatActivity(
  messages: readonly MegamindChatMessage[],
  activity: MegamindChatActivityState,
  unread: Map<string, number>,
  viewerHandle: string,
  isReading: (channel: string) => boolean,
  alert: (message: MegamindChatMessage, alert: MegamindChatAlert) => void
): MegamindChatActivityState {
  let seen = activity.seen
  let since = activity.since
  for (const message of messages) {
    if (message.createdAt > since) {
      since = message.createdAt
    }
    if (seen.has(message.id)) {
      continue
    }
    seen.add(message.id)
    if (!activity.seeded) {
      continue
    }
    const classified = classifyMegamindChatAlert(message, viewerHandle)
    const read = isReading(message.channel)
    if (!message.mine && !read) {
      unread.set(message.channel, (unread.get(message.channel) ?? 0) + 1)
    }
    if (classified && !read) {
      alert(message, classified)
    }
  }
  if (seen.size > 4000) {
    seen = new Set([...seen].slice(-2000))
  }
  return { seen, seeded: true, since }
}
