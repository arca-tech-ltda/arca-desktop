import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { Store } from '../persistence'
import { registerStatusMdTaskHandlers } from './status-md-tasks'

const mocks = vi.hoisted(() => ({ watch: vi.fn() }))
vi.mock('node:fs', () => ({ watch: mocks.watch }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: { removeHandler: vi.fn(), handle: vi.fn() },
    BrowserWindow: class extends EventEmitter {
      isDestroyed = () => false
      webContents = { send: vi.fn() }
    }
  }
})
vi.mock('../persistence', () => ({
  Store: class {
    getRepos = () => [{ id: 'r', path: '/repo', displayName: 'Repo' }]
  }
}))
vi.mock('../arca-priorities/priority-service', () => ({
  registerArcaPriorityHandlers: () => vi.fn()
}))
vi.mock('../git/status-md-task-recency', () => ({ statusMdTaskTimestamps: vi.fn() }))
afterEach(() => vi.useRealTimers())

it('handles Windows EPERM, closes and retries until the directory returns', () => {
  vi.useFakeTimers()
  const watcher = Object.assign(new EventEmitter(), { close: vi.fn() })
  const replacement = Object.assign(new EventEmitter(), { close: vi.fn() })
  mocks.watch
    .mockReturnValueOnce(watcher)
    .mockImplementationOnce(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    .mockReturnValue(replacement)
  const window = new BrowserWindow()
  registerStatusMdTaskHandlers(window, new Store())
  try {
    expect(() =>
      watcher.emit('error', Object.assign(new Error('deleted'), { code: 'EPERM' }))
    ).not.toThrow()
    expect(watcher.close).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(4000)
    expect(mocks.watch).toHaveBeenCalledTimes(3)
    expect(replacement.listenerCount('error')).toBe(1)
  } finally {
    window.emit('closed')
  }
  expect(replacement.close).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(4000)
  expect(mocks.watch).toHaveBeenCalledTimes(3)
})
