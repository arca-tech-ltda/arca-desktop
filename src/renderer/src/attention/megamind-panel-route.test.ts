import { expect, it } from 'vitest'
import {
  consumeMegamindMention,
  consumeMegamindRequestedChannel,
  megamindPanelRoute,
  requestMegamindMention,
  routeMegamindPanel
} from './megamind-panel-route'
import { MEGAMIND_GROUP_CHANNEL } from '../../../shared/arca-megamind-chat'

it('sends an agent mention to the group channel, where the mention wakes the agent', () => {
  routeMegamindPanel({ tab: 'chat', channel: 'dm:apa0b320to4sf22:bqr1c430up5tg33' })
  consumeMegamindRequestedChannel()
  requestMegamindMention('enzo-pi')
  expect(megamindPanelRoute()).toMatchObject({
    tab: 'chat',
    requestedChannel: MEGAMIND_GROUP_CHANNEL,
    pendingMention: 'enzo-pi'
  })
  consumeMegamindMention()
  consumeMegamindRequestedChannel()
  expect(megamindPanelRoute().pendingMention).toBeUndefined()
  expect(megamindPanelRoute().requestedChannel).toBeUndefined()
})
