import type { ArcaMegamindApi } from '../../../shared/arca-megamind'
import type { MegamindChatState } from '../../../shared/arca-megamind-chat'

let unreadCount = 0
const listeners = new Set<() => void>()

function countUnread(state: MegamindChatState): number {
  if (state.availability === 'login' || state.availability === 'unsupported') {
    return 0
  }
  return state.channels.reduce((total, channel) => total + Math.max(0, channel.unread), 0)
}

function publish(state: MegamindChatState): void {
  const next = countUnread(state)
  if (next === unreadCount) {
    return
  }
  unreadCount = next
  for (const listener of listeners) {
    listener()
  }
}

export function megamindUnreadSnapshot(): number {
  return unreadCount
}

export function subscribeMegamindUnread(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Mirrors main's chat authority without polling or deriving read state in the renderer. */
export function startMegamindUnreadMirror(
  api: Pick<ArcaMegamindApi, 'chatState' | 'onChatState'>
): () => void {
  let disposed = false
  let sequence = 0
  const off = api.onChatState((state) => {
    sequence += 1
    if (!disposed) {
      publish(state)
    }
  })
  const snapshotSequence = sequence
  void api
    .chatState()
    .then((state) => {
      if (!disposed && sequence === snapshotSequence) {
        publish(state)
      }
    })
    .catch(() => {})

  return () => {
    disposed = true
    off()
  }
}
