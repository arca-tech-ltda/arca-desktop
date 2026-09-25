import type { BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ projects: [] })),
  handle: vi.fn(),
  send: vi.fn(),
  read: vi.fn(async () => '- [ ] Task'),
  closed: vi.fn(),
  stop: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/test' },
  ipcMain: { removeHandler: vi.fn(), handle: mocks.handle }
}))
vi.mock('node:fs/promises', () => ({ readFile: mocks.read, writeFile: vi.fn(async () => {}) }))
vi.mock('../ipc/ui', () => ({ isTrustedUIRenderer: () => true }))
vi.mock('../arca-megamind/priorities', () => ({
  listMegamindPriorities: mocks.list,
  onMegamindPrioritiesChanged: () => mocks.stop
}))
vi.mock('../host/electron-runtime-desktop-surface', () => ({
  electronRuntimeDesktopSurface: { showNotification: vi.fn() }
}))
vi.mock('../stats/project-time-store', () => ({ readProjectTimeSnapshot: () => [] }))
import { registerArcaPriorityHandlers } from './priority-service'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('reads the snapshot without refreshing and broadcasts only changed priorities', async () => {
  vi.useFakeTimers()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Only these BrowserWindow methods are exercised by registration.
  const window = {
    webContents: { id: 1, send: mocks.send },
    isDestroyed: () => false,
    once: mocks.closed
  } as unknown as BrowserWindow
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: PriorityService only calls getRepos on this store double.
  const store = {
    getRepos: () => [{ id: 'repo', path: '/repo', displayName: 'Project' }]
  } as unknown as Store
  const refresh = registerArcaPriorityHandlers(window, store)
  await vi.advanceTimersByTimeAsync(0)
  const handler = mocks.handle.mock.calls[0][1]
  const initial = await handler({ sender: { id: 1 } })
  expect(initial).toHaveLength(1)
  expect(mocks.list).toHaveBeenCalledTimes(1)
  expect(mocks.send).toHaveBeenCalledTimes(1)
  await handler({ sender: { id: 1 } })
  expect(mocks.list).toHaveBeenCalledTimes(1)
  refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.list).toHaveBeenCalledTimes(2)
  expect(mocks.send).toHaveBeenCalledTimes(1)
  mocks.closed.mock.calls[0][1]()
  expect(mocks.stop).toHaveBeenCalledOnce()
})
