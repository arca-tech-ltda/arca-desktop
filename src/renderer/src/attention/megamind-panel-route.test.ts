import { expect, it } from 'vitest'
import {
  consumeMegamindRequestedChannel,
  megamindPanelRoute,
  routeMegamindPanel
} from './megamind-panel-route'

it('keeps the conversation a notification asked for until the panel opens it', () => {
  routeMegamindPanel({ channel: 'dm:apa0b320to4sf22:bqr1c430up5tg33' })
  expect(megamindPanelRoute().requestedChannel).toBe('dm:apa0b320to4sf22:bqr1c430up5tg33')
  consumeMegamindRequestedChannel()
  expect(megamindPanelRoute().requestedChannel).toBeUndefined()
})

it('routes an approval without opening a conversation', () => {
  routeMegamindPanel({ approvalId: 'zzzzzzzzzzzzzzz' })
  expect(megamindPanelRoute()).toMatchObject({
    approvalId: 'zzzzzzzzzzzzzzz',
    requestedChannel: undefined
  })
})
