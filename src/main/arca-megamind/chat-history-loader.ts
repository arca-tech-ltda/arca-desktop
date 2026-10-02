import type { MegamindChatMessage } from '../../shared/arca-megamind-chat'
import type { ChatResult } from './chat-client'

type MegamindChatHistoryResult = {
  messages: MegamindChatMessage[]
  loaded: boolean
}

export async function loadMegamindChatHistory(
  channel: string,
  recent: readonly MegamindChatMessage[],
  current: readonly MegamindChatMessage[],
  load: (channel: string) => Promise<ChatResult<MegamindChatMessage[]>>
): Promise<MegamindChatHistoryResult> {
  const history: ChatResult<MegamindChatMessage[]> = await load(channel).catch(
    () => ({ ok: false, reason: 'error' }) as const
  )
  if (history.ok) {
    return { messages: history.value, loaded: true }
  }
  // A failed history poll keeps the panel readable with what is already shown plus the feed.
  const known = new Set(current.map((message) => message.id))
  return {
    loaded: false,
    messages: [
      ...current,
      ...recent.filter((message) => message.channel === channel && !known.has(message.id))
    ]
  }
}
