import { afterEach, expect, it, vi } from 'vitest'
import {
  isPiAccountSelectionSupported,
  onPiAccountSelectionSupportChanged,
  refreshPiAccountSelectionSupport,
  resetPiAccountSelectionSupportForTest,
  setPiAccountSelectionSupportProbe
} from './pi-account-selection-support'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  resetPiAccountSelectionSupportForTest()
})

it('re-checks the installed Pi once the cached answer is older than a minute', async () => {
  vi.useFakeTimers()
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '')
  let supported = true
  const probe = vi.fn(() => supported)
  setPiAccountSelectionSupportProbe(probe)
  expect(await refreshPiAccountSelectionSupport()).toBe(true)

  // Inside the window, every launch reads the cached answer without forking a probe.
  expect(isPiAccountSelectionSupported()).toBe(true)
  expect(probe).toHaveBeenCalledTimes(1)

  supported = false
  vi.setSystemTime(Date.now() + 61_000)
  const changes: boolean[] = []
  const stop = onPiAccountSelectionSupportChanged((next) => changes.push(next))
  // The stale answer is still returned, but the launch path started the re-check.
  expect(isPiAccountSelectionSupported()).toBe(true)
  await vi.waitFor(() => expect(changes).toEqual([false]))
  expect(probe).toHaveBeenCalledTimes(2)
  expect(isPiAccountSelectionSupported()).toBe(false)
  stop()
})

it('runs one probe for a burst of launches and reports a failing probe as no support', async () => {
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '')
  let release: (value: boolean) => void = () => {}
  const probe = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
  setPiAccountSelectionSupportProbe(probe)
  const answers = Promise.all([
    refreshPiAccountSelectionSupport(),
    refreshPiAccountSelectionSupport(),
    refreshPiAccountSelectionSupport()
  ])
  release(true)
  expect(await answers).toEqual([true, true, true])
  expect(probe).toHaveBeenCalledTimes(1)

  setPiAccountSelectionSupportProbe(() => {
    throw new Error('pi is not installed')
  })
  expect(await refreshPiAccountSelectionSupport()).toBe(false)
  expect(isPiAccountSelectionSupported()).toBe(false)
})
