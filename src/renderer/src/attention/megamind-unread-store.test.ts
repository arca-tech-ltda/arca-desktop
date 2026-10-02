import { afterEach, expect, it, vi } from 'vitest'
import type { MegamindChatState } from '../../../shared/arca-megamind-chat'
import { megamindUnreadSnapshot, startMegamindUnreadMirror } from './megamind-unread-store'

const state = (unread: number, availability: MegamindChatState['availability'] = 'ready') => ({
  availability,
  viewerHandle: 'biel',
  activeChannel: 'arca',
  channels: [
    {
      channel: 'arca',
      kind: 'group' as const,
      handle: '',
      name: 'ARCA',
      lastMessageAt: '',
      lastMessageBody: '',
      unread
    }
  ],
  messages: []
})

let stop: (() => void) | undefined
let emit: ((value: MegamindChatState) => void) | undefined

afterEach(() => {
  stop?.()
  stop = undefined
  emit = undefined
})

it('keeps a newer subscription update when the initial snapshot resolves late', async () => {
  let resolveSnapshot: (value: MegamindChatState) => void = () => {}
  const snapshot = new Promise<MegamindChatState>((resolve) => {
    resolveSnapshot = resolve
  })
  stop = startMegamindUnreadMirror({
    chatState: () => snapshot,
    onChatState: (listener) => {
      emit = listener
      return vi.fn()
    }
  })

  emit?.(state(4))
  resolveSnapshot(state(1))
  await snapshot

  expect(megamindUnreadSnapshot()).toBe(4)
})

it('keeps authoritative unread through transient loading and error states', async () => {
  stop = startMegamindUnreadMirror({
    chatState: () => Promise.resolve(state(5)),
    onChatState: (listener) => {
      emit = listener
      return vi.fn()
    }
  })
  await Promise.resolve()

  emit?.(state(6, 'loading'))
  expect(megamindUnreadSnapshot()).toBe(6)
  emit?.(state(7, 'error'))
  expect(megamindUnreadSnapshot()).toBe(7)
  emit?.({ ...state(0, 'loading'), channels: [] })
  expect(megamindUnreadSnapshot()).toBe(0)
})

it('clears stale account unread on a login reset and ignores updates after cleanup', async () => {
  stop = startMegamindUnreadMirror({
    chatState: () => Promise.resolve(state(3)),
    onChatState: (listener) => {
      emit = listener
      return vi.fn()
    }
  })
  await Promise.resolve()
  expect(megamindUnreadSnapshot()).toBe(3)

  emit?.(state(9, 'login'))
  expect(megamindUnreadSnapshot()).toBe(0)
  stop()
  stop = undefined
  emit?.(state(2))
  expect(megamindUnreadSnapshot()).toBe(0)
})
