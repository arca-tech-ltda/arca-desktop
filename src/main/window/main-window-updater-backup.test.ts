import type { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { Store } from '../persistence'
import { scheduleMainWindowAutoUpdaterSetup } from './main-window-updater'

const cleanup = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../updater/arca-mac-install', () => ({ removeHealthyMacUpdateBackup: cleanup }))
vi.mock('../updater', () => ({ setupAutoUpdater: vi.fn() }))
vi.mock('../ipc/ui', () => ({ isTrustedUIRenderer: vi.fn() }))
vi.mock('../startup/startup-diagnostics', () => ({ logStartupMilestone: vi.fn() }))
vi.mock('../persistence', () => ({ Store: class {} }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: { isPackaged: true },
    BrowserWindow: class extends EventEmitter {
      isDestroyed = () => false
      webContents = new EventEmitter()
    }
  }
})
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.clearAllTimers()
  vi.useRealTimers()
  cleanup.mockClear()
})

it.each(['darwin', 'win32'])('waits for a ready window before cleanup on %s', async (host) => {
  vi.useFakeTimers()
  Object.defineProperty(process, 'platform', { value: host })
  const window = new BrowserWindow()
  scheduleMainWindowAutoUpdaterSetup(window, new Store())
  await vi.advanceTimersByTimeAsync(15_000)
  expect(cleanup).not.toHaveBeenCalled()
  window.emit('ready-to-show')
  expect(cleanup).toHaveBeenCalledTimes(host === 'darwin' ? 1 : 0)
})

it('cleans up once after a background launch finishes loading', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  const window = new BrowserWindow() as unknown as InstanceType<typeof BrowserWindow> & {
    webContents: EventEmitter
  }
  scheduleMainWindowAutoUpdaterSetup(window, new Store())
  window.webContents.emit('did-finish-load')
  window.emit('ready-to-show')
  expect(cleanup).toHaveBeenCalledTimes(1)
})
