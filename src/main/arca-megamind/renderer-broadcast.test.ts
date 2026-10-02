import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'

class FakeWebContents extends EventEmitter {
  send = vi.fn()
  destroyed = false
  constructor(
    readonly trusted: boolean,
    readonly focused = false
  ) {
    super()
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  isFocused(): boolean {
    return this.focused
  }
}

function contents(trusted: boolean, focused = false): FakeWebContents & WebContents {
  const fake = new FakeWebContents(trusted, focused)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the broadcast and the subscriber set only use send, once and isDestroyed, which the fake implements.
  return fake as FakeWebContents & WebContents
}

let windows: { webContents: FakeWebContents }[] = []

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows } }))
vi.mock('../ipc/ui', () => ({
  isTrustedUIRenderer: (sender: FakeWebContents) => sender.trusted && !sender.destroyed
}))

const { broadcastToTrustedRenderers, MegamindChatVisibilityOwner, MegamindSubscribers } =
  await import('./renderer-broadcast')

beforeEach(() => {
  windows = []
})

it('never publishes chat state to the Mainframe guest or the login window', () => {
  const ui = contents(true)
  const guest = contents(false)
  windows = [{ webContents: ui }, { webContents: guest }]
  broadcastToTrustedRenderers('arcaMegamind:chatState', { availability: 'ready' })
  expect(ui.send).toHaveBeenCalledWith('arcaMegamind:chatState', { availability: 'ready' })
  expect(guest.send).not.toHaveBeenCalled()
})

it('takes a subscription only from the app UI and forgets it when the renderer goes', () => {
  const subscribers = new MegamindSubscribers()
  const ui = contents(true)
  expect(subscribers.add(ui)).toBe(true)
  expect(subscribers.add(ui)).toBe(false)
  expect(subscribers.add(contents(false))).toBe(false)

  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(true)
  expect(ui.send).toHaveBeenCalledWith('arcaMegamind:notification', {
    kind: 'chat',
    id: 'abcdefghijklmno'
  })
  ui.emit('render-process-gone')
  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(false)
})

it('prefers the focused eligible UI subscriber and falls back to the first', () => {
  const subscribers = new MegamindSubscribers()
  const first = contents(true)
  const focused = contents(true, true)
  subscribers.add(first)
  subscribers.add(focused)

  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(true)
  expect(first.send).not.toHaveBeenCalled()
  expect(focused.send).toHaveBeenCalledOnce()

  focused.destroyed = true
  expect(subscribers.notify({ kind: 'chat', id: 'bcdefghijklmnop' })).toBe(true)
  expect(first.send).toHaveBeenCalledWith('arcaMegamind:notification', {
    kind: 'chat',
    id: 'bcdefghijklmnop'
  })
})

it('ignores an unsubscribe from a renderer that is not the app UI', () => {
  const subscribers = new MegamindSubscribers()
  const ui = contents(true)
  subscribers.add(ui)
  subscribers.remove(contents(false))
  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(true)
  subscribers.remove(ui)
  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(false)
})

it('returns false without an eligible trusted subscriber', () => {
  const subscribers = new MegamindSubscribers()
  const ui = contents(true)
  subscribers.add(ui)
  ui.destroyed = true

  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(false)
  expect(ui.send).not.toHaveBeenCalled()
})

it('retains at most fifty chat alerts until the next eligible subscriber', () => {
  const subscribers = new MegamindSubscribers()
  for (let index = 0; index < 51; index++) {
    expect(subscribers.notifyChat({ kind: 'chat', id: `chat-${index}` })).toBe(false)
  }
  subscribers.notifyChat({ kind: 'request', id: 'not-retained' })
  const ui = contents(true)
  subscribers.add(ui)

  expect(ui.send).toHaveBeenCalledTimes(50)
  expect(ui.send.mock.calls[0]?.[1]).toEqual({ kind: 'chat', id: 'chat-1' })
  expect(ui.send.mock.calls.at(-1)?.[1]).toEqual({ kind: 'chat', id: 'chat-50' })
})

it.each(['', 'second'])('discards pending chat alerts when the known viewer becomes %j', (next) => {
  const subscribers = new MegamindSubscribers()
  subscribers.chatViewerChanged('first')
  subscribers.notifyChat({ kind: 'chat', id: 'old-viewer-alert' })
  subscribers.chatViewerChanged(next)
  const ui = contents(true)
  subscribers.add(ui)
  expect(ui.send).not.toHaveBeenCalled()
})

it('releases visibility only when the owning renderer is removed', () => {
  const apply = vi.fn()
  const visibility = new MegamindChatVisibilityOwner(apply)
  const subscribers = new MegamindSubscribers((sender) => visibility.remove(sender))
  const first = contents(true)
  const second = contents(true)
  subscribers.add(first)
  subscribers.add(second)

  visibility.set(first, true, 'arca')
  visibility.set(second, false, null)
  expect(apply).toHaveBeenCalledTimes(1)
  visibility.set(second, true, 'dm:apa0b320to4sf22:bqr1c430up5tg33')
  first.emit('destroyed')
  expect(apply).toHaveBeenCalledTimes(2)
  second.emit('render-process-gone')
  expect(apply).toHaveBeenLastCalledWith(false, null)
  expect(apply).toHaveBeenCalledTimes(3)
})
