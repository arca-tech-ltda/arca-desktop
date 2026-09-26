import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NotificationAuthorizationStatus from './notification-authorization-status'

const mocks = vi.hoisted(() => ({ execFile: vi.fn(), existsSync: vi.fn(() => true) }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({ existsSync: mocks.existsSync }))

const realPlatform = process.platform

async function loadModule(): Promise<typeof NotificationAuthorizationStatus> {
  vi.resetModules()
  return import('./notification-authorization-status')
}

type ExecFileCallback = (error: Error | null, stdout: string) => void

function lastCall(): { args: string[]; options: { timeout: number }; done: ExecFileCallback } {
  const [, args, options, done] = mocks.execFile.mock.calls.at(-1)!
  return { args, options, done }
}

beforeEach(() => {
  mocks.execFile.mockReset()
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
})

describe('requestNotificationAuthorization', () => {
  it('never kills the helper on a timer while the prompt is open', async () => {
    const { requestNotificationAuthorization } = await loadModule()
    const pending = requestNotificationAuthorization()
    const { args, options, done } = lastCall()
    expect(args).toEqual(['--request'])
    // A timeout here would SIGTERM the asking process, which macOS records as a denial.
    expect(options.timeout).toBe(0)
    done(null, '{"authorization":"authorized","alert":"enabled"}')
    expect(await pending).toBe('authorized')
  })

  it('runs one prompt for concurrent callers', async () => {
    const { requestNotificationAuthorization } = await loadModule()
    const first = requestNotificationAuthorization()
    const second = requestNotificationAuthorization()
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
    lastCall().done(null, '{"authorization":"denied"}')
    expect(await Promise.all([first, second])).toEqual(['denied', 'denied'])
  })
})

describe('readNotificationAuthorizationStatus', () => {
  it('keeps a short timeout on the silent readout', async () => {
    const { readNotificationAuthorizationStatus } = await loadModule()
    const pending = readNotificationAuthorizationStatus()
    const { args, options, done } = lastCall()
    expect(args).toEqual([])
    expect(options.timeout).toBe(4000)
    done(null, '{"authorization":"not-determined"}')
    expect(await pending).toBe('not-determined')
  })
})
