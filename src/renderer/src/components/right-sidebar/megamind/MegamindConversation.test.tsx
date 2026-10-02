// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MegamindConversation } from './MegamindConversation'
import { clearMegamindComposerDrafts } from './megamind-composer-drafts'
import {
  emptyMegamindChatState,
  type MegamindChatPostResult,
  type MegamindChatState,
  type MegamindMember
} from '../../../../../shared/arca-megamind-chat'

const DM = 'dm:apa0b320to4sf22:bqr1c430up5tg33'

const members: MegamindMember[] = [
  {
    handle: 'enzo',
    name: 'Enzo',
    online: true,
    appOnline: true,
    sessions: [
      {
        sessionId: 'b1c2',
        label: 'pi wgs-sistema@MEAN',
        project: 'wgs-sistema',
        harness: 'pi',
        note: 'emissor fiscal',
        lastSeen: '2026-01-01 12:00:00Z',
        status: 'active'
      }
    ]
  }
]

const state = (channel = 'arca'): MegamindChatState => ({
  ...emptyMegamindChatState(),
  availability: 'ready',
  viewerHandle: 'biel',
  activeChannel: channel,
  channels: [
    {
      channel: 'arca',
      kind: 'group',
      handle: '',
      name: 'ARCA',
      lastMessageAt: '',
      lastMessageBody: '',
      unread: 0
    },
    {
      channel: DM,
      kind: 'dm',
      handle: 'enzo',
      name: 'Enzo',
      lastMessageAt: '',
      lastMessageBody: '',
      unread: 0
    }
  ]
})

afterEach(() => {
  cleanup()
  clearMegamindComposerDrafts('biel')
})

function chat(
  post: (target: string, body: string) => Promise<MegamindChatPostResult>,
  channel = 'arca'
): { input: HTMLTextAreaElement } {
  render(
    <MegamindConversation
      channel={channel}
      state={state(channel)}
      members={members}
      post={post}
      onBack={() => {}}
    />
  )
  const input = screen.getByLabelText(channel === 'arca' ? 'Message # arca' : 'Message @enzo')
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error('composer input not found')
  }
  return { input }
}

function send(input: HTMLTextAreaElement, body: string): void {
  fireEvent.change(input, { target: { value: body, selectionStart: body.length } })
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
}

it.each([
  ['rate', 'Too many messages at once. Wait a moment and send again.'],
  ['tooLong', 'The Mainframe rejected this message: it is too long.'],
  ['login', 'Your Mainframe session expired. Sign in and send again.'],
  ['error', 'Could not confirm delivery. Check the conversation before retrying.']
] as const)('keeps the draft and explains a %s failure', async (status, message) => {
  const post = vi.fn().mockResolvedValue({ status })
  const { input } = chat(post)
  send(input, 'oi pessoal')
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message))
  expect(input.value).toBe('oi pessoal')
  // The conversation itself stays usable: only the message failed.
  expect(input.disabled).toBe(false)
})

it('clears the draft and reports which mentioned agents woke', async () => {
  const post = vi.fn().mockResolvedValue({
    status: 'ok',
    woken: [
      { handle: 'enzo', woken: true },
      { handle: 'daniel', woken: false }
    ]
  })
  const { input } = chat(post)
  send(input, 'roda o deploy @enzo-pi @daniel-pi')
  await waitFor(() => expect(input.value).toBe(''))
  expect(screen.getByRole('status').textContent).toBe(
    'Agent of enzo woken · No active agent for daniel'
  )
})

it('says nothing when the message mentioned no agent', async () => {
  const post = vi.fn().mockResolvedValue({ status: 'ok', woken: [] })
  const { input } = chat(post)
  send(input, 'oi pessoal')
  await waitFor(() => expect(input.value).toBe(''))
  expect(screen.queryByRole('status')).toBeNull()
})

it('addresses a DM by the partner handle and shows their sessions', async () => {
  const post = vi.fn().mockResolvedValue({ status: 'ok', woken: [] })
  const { input } = chat(post, DM)
  expect(screen.getByText('wgs-sistema · pi')).toBeTruthy()
  expect(screen.getByText(/1 agent/)).toBeTruthy()
  send(input, 'consegue olhar o deploy?')
  await waitFor(() => expect(post).toHaveBeenCalledWith('enzo', 'consegue olhar o deploy?'))
})

it('restores a draft after leaving and reopening a conversation', () => {
  const view = render(
    <MegamindConversation
      channel="arca"
      state={state()}
      members={members}
      post={vi.fn()}
      onBack={() => {}}
    />
  )
  const input = screen.getByLabelText('Message # arca')
  fireEvent.change(input, { target: { value: 'guardar para depois', selectionStart: 20 } })
  view.unmount()
  render(
    <MegamindConversation
      channel="arca"
      state={state()}
      members={members}
      post={vi.fn()}
      onBack={() => {}}
    />
  )
  expect(screen.getByLabelText('Message # arca')).toHaveProperty('value', 'guardar para depois')
})

it('waits for main historyLoading before showing another conversation’s history', () => {
  render(
    <MegamindConversation
      channel={DM}
      state={{
        ...state('arca'),
        historyLoading: true,
        messages: [
          {
            id: 'abcdefghijklmno',
            channel: 'arca',
            authorKind: 'human',
            authorName: 'leo',
            authorLabel: '',
            body: 'o logo da WGS tá no drive',
            mentions: [],
            createdAt: '2026-01-01 12:30:00Z',
            mine: false
          }
        ]
      }}
      members={members}
      post={vi.fn()}
      onBack={() => {}}
    />
  )
  expect(screen.queryByText('o logo da WGS tá no drive')).toBeNull()
  expect(screen.getByText('Loading chat…')).toBeTruthy()
})

it('disables the retained composer while its conversation is hidden', () => {
  render(
    <MegamindConversation
      channel="arca"
      isVisible={false}
      state={state()}
      members={members}
      post={vi.fn()}
      onBack={() => {}}
    />
  )
  expect(screen.getByLabelText('Message # arca')).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true)
})

it('keeps an unresolved DM read-only without inventing a recipient', () => {
  const post = vi.fn()
  const snapshot = state(DM)
  render(
    <MegamindConversation
      channel={DM}
      state={{
        ...snapshot,
        channels: snapshot.channels.map((channel) =>
          channel.channel === DM ? { ...channel, handle: '' } : channel
        )
      }}
      members={members}
      post={post}
      onBack={() => {}}
    />
  )
  expect(screen.getByLabelText('Resolving conversation…')).toHaveProperty('disabled', true)
  expect(post).not.toHaveBeenCalled()
})
