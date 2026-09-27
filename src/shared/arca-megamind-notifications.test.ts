import { expect, it } from 'vitest'
import { classifyMegamindChatAlert, MegamindNotificationDedup } from './arca-megamind-notifications'
import type { MegamindChatMessage } from './arca-megamind-chat'

const message = (fields: Partial<MegamindChatMessage>): MegamindChatMessage => ({
  id: 'abcdefghijklmno',
  channel: 'arca',
  authorKind: 'human',
  authorName: 'enzo',
  authorLabel: '',
  body: 'oi',
  mentions: [],
  createdAt: '2026-01-01T00:00:00Z',
  mine: false,
  ...fields
})

it('notifies on DMs and mentions of the viewer, never on the viewer’s own messages', () => {
  expect(classifyMegamindChatAlert(message({ channel: 'dm:aaa:bbb' }), 'biel')).toBe('dm')
  expect(classifyMegamindChatAlert(message({ body: 'cc @biel-pi' }), 'biel')).toBe('mention')
  expect(classifyMegamindChatAlert(message({}), 'biel')).toBeNull()
  expect(
    classifyMegamindChatAlert(message({ channel: 'dm:aaa:bbb', mine: true }), 'biel')
  ).toBeNull()
  expect(classifyMegamindChatAlert(message({ authorName: 'biel' }), 'biel')).toBeNull()
})

it('deduplicates chat alerts by message id', () => {
  const dedup = new MegamindNotificationDedup()
  expect(dedup.accept({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(true)
  expect(dedup.accept({ kind: 'chat', id: 'abcdefghijklmno' })).toBe(false)
})

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
