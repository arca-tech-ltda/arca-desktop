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
