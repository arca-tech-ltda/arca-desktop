import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { Store } from '../persistence'
import { registerStatusMdTaskHandlers } from './status-md-tasks'

const mocks = vi.hoisted(() => ({ watch: vi.fn(), handle: vi.fn(), trusted: vi.fn(() => true) }))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))
vi.mock('node:fs', () => ({ watch: mocks.watch }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  let id = 0
  return {
    ipcMain: { removeHandler: vi.fn(), handle: mocks.handle },
    BrowserWindow: class extends EventEmitter {
      isDestroyed = () => false
      webContents = { id: ++id, send: vi.fn() }
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
beforeEach(() => {
  vi.clearAllMocks()
  mocks.watch.mockReset()
})
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
    vi.advanceTimersByTime(6000)
    expect(mocks.watch).toHaveBeenCalledTimes(3)
    expect(replacement.listenerCount('error')).toBe(1)
  } finally {
    window.emit('closed')
  }
  expect(replacement.close).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(6000)
  expect(mocks.watch).toHaveBeenCalledTimes(3)
})

it('accepts mixed-case names and isolates window cleanup and IPC callers', async () => {
  vi.useFakeTimers()
  const watchers: (EventEmitter & { close: ReturnType<typeof vi.fn> })[] = []
  mocks.watch.mockImplementation(() => {
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() })
    watchers.push(watcher)
    return watcher
  })
  const first = new BrowserWindow()
  const second = new BrowserWindow()
  registerStatusMdTaskHandlers(first, new Store())
  registerStatusMdTaskHandlers(second, new Store())
  try {
    first.emit('closed')
    expect(watchers[0].close).toHaveBeenCalledOnce()
    expect(watchers[1].close).not.toHaveBeenCalled()
    mocks.watch.mock.calls[1][2]('change', 'Status.md')
    await vi.advanceTimersByTimeAsync(120)
    expect(second.webContents.send).toHaveBeenCalledWith('status-md-tasks:changed', { repoId: 'r' })
    expect(first.webContents.send).not.toHaveBeenCalled()
    mocks.trusted.mockReturnValueOnce(false)
    expect(() => mocks.handle.mock.calls.at(-1)![1]({ sender: second.webContents })).toThrow(
      'Untrusted'
    )
  } finally {
    second.emit('closed')
  }
})

it('backs off failed watches from two seconds up to thirty seconds', () => {
  vi.useFakeTimers()
  mocks.watch.mockImplementation(() => {
    throw new Error('EPERM')
  })
  const window = new BrowserWindow()
  registerStatusMdTaskHandlers(window, new Store())
  try {
    expect(mocks.watch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    expect(mocks.watch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2_000)
    expect(mocks.watch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(26_000)
    expect(mocks.watch).toHaveBeenCalledTimes(5)
    vi.advanceTimersByTime(30_000)
    expect(mocks.watch).toHaveBeenCalledTimes(6)
  } finally {
    window.emit('closed')
  }
})
