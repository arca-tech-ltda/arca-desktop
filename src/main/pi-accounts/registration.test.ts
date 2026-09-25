import { expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { isTrustedUIRenderer } from '../ipc/ui'
import { registerPiAccounts } from './registration'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { once: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../ipc/ui', () => ({ isTrustedUIRenderer: vi.fn(() => false) }))
vi.mock('./service', () => ({
  PiAccountsService: class {
    list = vi.fn()
    use = vi.fn()
    add = vi.fn()
    remove = vi.fn()
    rename = vi.fn()
    abandonPendingLogin = vi.fn()
    onLoginUrlChanged = vi.fn(() => vi.fn())
    watch = vi.fn(() => vi.fn())
  }
}))

function handlerFor(channel: string) {
  const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === channel)?.[1]
  if (!handler) {
    throw new Error(`Missing IPC registration for ${channel}`)
  }
  return handler
}

it('rejects untrusted renderers and invalid provider/name arguments before accessing credentials', () => {
  registerPiAccounts()
  const list = handlerFor('piAccounts:list')
  const use = handlerFor('piAccounts:use')
  const add = handlerFor('piAccounts:add')
  const remove = handlerFor('piAccounts:remove')
  const rename = handlerFor('piAccounts:rename')
  const cancelAdd = handlerFor('piAccounts:cancelAdd')
  const event = { sender: {} }
  for (const [handler, args] of [
    [list, []],
    [use, ['anthropic', 'work']],
    [add, ['anthropic']],
    [remove, ['anthropic', 'work']],
    [rename, ['anthropic', 'work', 'job']],
    [cancelAdd, []]
  ] as const) {
    expect(() => Reflect.apply(handler, undefined, [event, ...args])).toThrow('Untrusted')
  }
  vi.mocked(isTrustedUIRenderer).mockReturnValue(true)
  expect(() => Reflect.apply(use, undefined, [event, 'other', 'work'])).toThrow('Invalid')
  expect(() => Reflect.apply(use, undefined, [event, 'anthropic', {}])).toThrow('Invalid')
  expect(() => Reflect.apply(add, undefined, [event, 'other'])).toThrow('Invalid')
  expect(() => Reflect.apply(remove, undefined, [event, 'anthropic', ''])).toThrow('Invalid')
  expect(() => Reflect.apply(rename, undefined, [event, 'anthropic', 'work', 'two words'])).toThrow(
    'Invalid Pi account name'
  )
})
