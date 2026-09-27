import type { MegamindRecord } from './arca-megamind'
import type { MegamindChatMessage } from './arca-megamind-chat'
import { mentionsHandle } from './arca-megamind-mentions'

/** What earns a chat message a native notification; everything else stays a silent unread. */
export type MegamindChatAlert = 'dm' | 'mention'

export function classifyMegamindChatAlert(
  message: MegamindChatMessage,
  viewerHandle: string
): MegamindChatAlert | null {
  if (message.mine || (viewerHandle && message.authorName === viewerHandle)) {
    return null
  }
  if (mentionsHandle(message.body, viewerHandle)) {
    return 'mention'
  }
  return message.channel.startsWith('dm:') ? 'dm' : null
}

export class MegamindNotificationDedup {
  private seen = new Set<string>()
  accept(item: MegamindRecord): boolean {
    if (
      typeof item.id !== 'string' ||
      ![
        'request',
        'approval_pending',
        'approval_decision',
        'handoff',
        'request_update',
        'chat'
      ].includes(String(item.kind))
    ) {
      return false
    }
    if (item.kind === 'request_update' && item.status !== 'done' && item.status !== 'failed') {
      return false
    }
    const key = `${item.kind}:${item.id}`
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    if (this.seen.size > 2000) {
      const oldest = this.seen.values().next().value
      if (oldest) {
        this.seen.delete(oldest)
      }
    }
    return true
  }
}
