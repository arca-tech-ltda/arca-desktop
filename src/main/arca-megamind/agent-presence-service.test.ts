import { expect, it } from 'vitest'
import { configuredIdleMs } from './agent-presence-service'

it('takes the idle window from the environment, bounded', () => {
  expect(configuredIdleMs({})).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: 'nao' })).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '0' })).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '5' })).toBe(300_000)
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '99999' })).toBe(1440 * 60_000)
})
