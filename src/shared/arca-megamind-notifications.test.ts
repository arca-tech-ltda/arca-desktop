import { expect, it } from 'vitest'
import { MegamindNotificationDedup } from './arca-megamind-notifications'

it('deduplicates SSE and inbox by kind and id without hiding later decisions', () => {
  const dedup = new MegamindNotificationDedup()
  expect(dedup.accept({ kind: 'approval_pending', id: 'one' })).toBe(true)
  expect(dedup.accept({ kind: 'approval_pending', id: 'one' })).toBe(false)
  expect(dedup.accept({ kind: 'approval_decision', id: 'one' })).toBe(true)
  expect(dedup.accept({ kind: 'approval_decision', id: 'one', status: 'approved' })).toBe(false)
  expect(dedup.accept({ kind: 'request_update', id: 'two', status: 'in_progress' })).toBe(false)
  expect(dedup.accept({ kind: 'request_update', id: 'two', status: 'done' })).toBe(true)
  expect(dedup.accept({ kind: 'request_update', id: 'two', status: 'done' })).toBe(false)
  expect(dedup.accept({ kind: 'message', id: 'three' })).toBe(false)
})
