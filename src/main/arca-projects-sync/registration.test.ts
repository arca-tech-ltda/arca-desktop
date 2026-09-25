import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  sync: vi.fn(async () => ({})),
  focused: vi.fn(() => false),
  handle: vi.fn(),
  onWindow: vi.fn(),
  onApp: vi.fn(),
  onceApp: vi.fn(),
  trusted: vi.fn(() => true)
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/test', on: mocks.onApp, once: mocks.onceApp },
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, isFocused: mocks.focused, on: mocks.onWindow }
    ]
  },
  ipcMain: { handle: mocks.handle }
}))
vi.mock('node:fs/promises', () => ({ readFile: async () => '{}', writeFile: vi.fn() }))
vi.mock('../ipc/ui', () => ({ isTrustedUIRenderer: mocks.trusted }))
vi.mock('../persistence', () => ({ Store: class {} }))
vi.mock('./service', () => ({
  ArcaProjectsSync: class {
    syncNow = mocks.sync
    restoreSettings = vi.fn()
    status = () => ({})
  },
  shouldRunFocusedArcaSync: (last: number, now: number) => now - last >= 120_000
}))
import { Store } from '../persistence'
import { registerArcaProjectsSync } from './registration'

afterEach(() => vi.useRealTimers())
it('syncs every five minutes even unfocused and rejects untrusted IPC', async () => {
  vi.useFakeTimers()
  registerArcaProjectsSync(new Store())
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.sync).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(mocks.sync).toHaveBeenCalledTimes(2)
  mocks.trusted.mockReturnValue(false)
  for (const [, handler] of mocks.handle.mock.calls) {
    await expect(handler({ sender: {} }, true)).rejects.toThrow('Untrusted')
  }
  expect(mocks.sync).toHaveBeenCalledTimes(2)
  mocks.onceApp.mock.calls[0][1]()
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(mocks.sync).toHaveBeenCalledTimes(2)
})
