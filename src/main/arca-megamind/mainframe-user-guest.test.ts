import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

class FakeWebContents extends EventEmitter {
  loadURL = vi.fn(async () => {
    if (!loads) {
      throw new Error('offline')
    }
  })
  executeJavaScript = vi.fn(async () => ({ status: 200, data: 'ok' }))
}

class FakeBrowserWindow extends EventEmitter {
  webContents = new FakeWebContents()
  destroyed = false
  constructor() {
    super()
    windows.push(this)
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
    this.emit('closed')
  }
}

let windows: FakeBrowserWindow[] = []
let loads = true

vi.mock('electron', () => ({ BrowserWindow: FakeBrowserWindow }))
vi.mock('../arca-mainframe/arca-mainframe-guest-policy', () => ({
  installArcaMainframeGuestPolicy: () => {}
}))
vi.mock('../arca-mainframe/arca-mainframe-endpoint', () => ({
  getArcaMainframeEndpoint: () => ({
    origin: 'https://mainframe.example',
    panelUrl: 'https://mainframe.example/panel'
  })
}))
vi.mock('../window/foreground-activation-policy', () => ({ isBackgroundLaunch: () => true }))

const { MainframeUserGuest } = await import('./mainframe-user-guest')

beforeEach(() => {
  windows = []
  loads = true
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const request = { path: '/api/arca/chat/channels', projection: 'chatChannels' } as const

it('backs off instead of opening a window per poll while the Mainframe is unreachable', async () => {
  loads = false
  const guest = new MainframeUserGuest()
  await expect(guest.run(request)).rejects.toThrow('Mainframe session unavailable')
  expect(windows).toHaveLength(1)
  expect(windows[0].isDestroyed()).toBe(true)

  await expect(guest.run(request)).rejects.toThrow()
  expect(windows).toHaveLength(1)

  vi.advanceTimersByTime(5_000)
  await expect(guest.run(request)).rejects.toThrow()
  expect(windows).toHaveLength(2)

  // The window doubled: the same wait no longer earns an attempt.
  vi.advanceTimersByTime(5_000)
  await expect(guest.run(request)).rejects.toThrow()
  expect(windows).toHaveLength(2)
  vi.advanceTimersByTime(5_000)
  await expect(guest.run(request)).rejects.toThrow()
  expect(windows).toHaveLength(3)
})

it('drops a crashed guest and opens a fresh one on the next request', async () => {
  const guest = new MainframeUserGuest()
  expect(await guest.run(request)).toEqual({ status: 200, data: 'ok' })
  windows[0].webContents.emit('render-process-gone')
  expect(windows[0].isDestroyed()).toBe(true)

  expect(await guest.run(request)).toEqual({ status: 200, data: 'ok' })
  expect(windows).toHaveLength(2)
})

it('drops a guest whose renderer hangs', async () => {
  const guest = new MainframeUserGuest()
  await guest.run(request)
  windows[0].emit('unresponsive')
  expect(windows[0].isDestroyed()).toBe(true)
  await guest.run(request)
  expect(windows).toHaveLength(2)
})

it('never opens another guest after the app started quitting', async () => {
  const guest = new MainframeUserGuest()
  await guest.run(request)
  guest.close()
  expect(windows[0].isDestroyed()).toBe(true)
  await expect(guest.run(request)).rejects.toThrow('Mainframe session unavailable')
  expect(windows).toHaveLength(1)
})

it('discards a guest that finished loading after the app started quitting', async () => {
  const guest = new MainframeUserGuest()
  const pending = guest.run(request)
  guest.close()
  await expect(pending).rejects.toThrow('Mainframe session unavailable')
  expect(windows[0].isDestroyed()).toBe(true)
})
