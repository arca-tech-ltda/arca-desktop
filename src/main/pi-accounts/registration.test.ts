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
    watch = vi.fn(() => vi.fn())
  }
}))

it('rejects untrusted renderers and invalid provider/name arguments before accessing credentials', () => {
  registerPiAccounts()
  const list = vi
    .mocked(ipcMain.handle)
    .mock.calls.find((call) => call[0] === 'piAccounts:list')?.[1]
  const use = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === 'piAccounts:use')?.[1]
  expect(list).toBeDefined()
  expect(use).toBeDefined()
  if (!list || !use) {
    throw new Error('Missing IPC registration')
  }
  const event = { sender: {} }
  expect(() => Reflect.apply(list, undefined, [event])).toThrow('Untrusted')
  expect(() => Reflect.apply(use, undefined, [event, 'anthropic', 'work'])).toThrow('Untrusted')
  vi.mocked(isTrustedUIRenderer).mockReturnValue(true)
  expect(() => Reflect.apply(use, undefined, [event, 'other', 'work'])).toThrow('Invalid')
  expect(() => Reflect.apply(use, undefined, [event, 'anthropic', {}])).toThrow('Invalid')
})
