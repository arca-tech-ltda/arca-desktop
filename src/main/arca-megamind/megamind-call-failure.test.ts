import { expect, it } from 'vitest'
import { MegamindToolError } from './gateway'
import { classifyMegamindFailure } from './megamind-call-failure'

it('reads a credential problem as unauthorized', () => {
  for (const error of [
    new Error('Megamind HTTP 401'),
    new Error('Megamind HTTP 403'),
    new Error('Empty Megamind credential'),
    new Error('Invalid Megamind configuration'),
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    new MegamindToolError('Megamind tool failed', 'unauthorized device')
  ]) {
    expect(classifyMegamindFailure(error), String(error)).toBe('unauthorized')
  }
})

it('reads a rate limit, a server error and a timeout as transient', () => {
  for (const error of [
    new Error('Megamind HTTP 429'),
    new Error('Megamind HTTP 503'),
    new Error('fetch failed'),
    Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }),
    new MegamindToolError('Megamind tool failed', 'internal error')
  ]) {
    expect(classifyMegamindFailure(error), String(error)).toBe('transient')
  }
})
