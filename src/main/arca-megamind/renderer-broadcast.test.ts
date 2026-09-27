import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'

class FakeWebContents extends EventEmitter {
  send = vi.fn()
  destroyed = false
  constructor(readonly trusted: boolean) {
    super()
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
}

function contents(trusted: boolean): FakeWebContents & WebContents {
  const fake = new FakeWebContents(trusted)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the broadcast and the subscriber set only use send, once and isDestroyed, which the fake implements.
  return fake as FakeWebContents & WebContents
}

let windows: { webContents: FakeWebContents }[] = []

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows } }))
vi.mock('../ipc/ui', () => ({
  isTrustedUIRenderer: (sender: FakeWebContents) => sender.trusted && !sender.destroyed
}))

const { broadcastToTrustedRenderers, MegamindSubscribers } = await import('./renderer-broadcast')

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

it('ignores an unsubscribe from a renderer that is not the app UI', () => {
  const subscribers = new MegamindSubscribers()
  const ui = contents(true)
  subscribers.add(ui)
  subscribers.remove(contents(false))
  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(true)
  subscribers.remove(ui)
  expect(subscribers.notify({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(false)
})
