// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MegamindConversationList, megamindChannelTitle } from './MegamindConversationList'
import type { MegamindChatChannel, MegamindMember } from '../../../../../shared/arca-megamind-chat'

const DM = 'dm:apa0b320to4sf22:bqr1c430up5tg33'

/** The directory denormalizes the e-mail local part, which keeps the handle the partner dropped. */
const channels: MegamindChatChannel[] = [
  {
    channel: DM,
    kind: 'dm',
    handle: 'enzo',
    name: 'jabiscreidisom',
    lastMessageAt: '2026-01-01 12:00:00Z',
    lastMessageBody: 'bom dia',
    unread: 0
  }
]

const members: MegamindMember[] = [
  { handle: 'enzo', name: 'jabiscreidisom', online: true, appOnline: true, sessions: [] }
]

afterEach(cleanup)

it('titles a DM after the member handle instead of the stored name', () => {
  render(
    <MegamindConversationList
      channels={channels}
      members={members}
      emptyText="sem conversas"
      onOpen={() => {}}
    />
  )
  expect(screen.getByText('enzo')).toBeTruthy()
  expect(screen.queryByText('jabiscreidisom')).toBeNull()
  // The avatar follows the same name, so the row cannot show two identities.
  expect(screen.getByText('E')).toBeTruthy()
})

it('falls back to what the channel stored when the member is unknown', () => {
  expect(megamindChannelTitle(channels[0], [])).toBe('enzo')
  expect(megamindChannelTitle({ ...channels[0], handle: '' }, [])).toBe('jabiscreidisom')
  expect(megamindChannelTitle({ ...channels[0], kind: 'group', channel: 'arca' }, members)).toBe(
    '# arca'
  )
})
