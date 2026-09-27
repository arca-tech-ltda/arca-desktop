// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MegamindChatTab } from './MegamindChatTab'
import {
  emptyMegamindChatState,
  type MegamindChatPostResult,
  type MegamindChatState
} from '../../../../../shared/arca-megamind-chat'

const state = (): MegamindChatState => ({
  ...emptyMegamindChatState(),
  availability: 'ready',
  viewerHandle: 'biel',
  channels: [
    { channel: 'arca', kind: 'group', handle: '', name: 'ARCA', lastMessageAt: '', unread: 0 }
  ]
})

afterEach(cleanup)

function chat(post: (target: string, body: string) => Promise<MegamindChatPostResult>): {
  input: HTMLTextAreaElement
} {
  render(<MegamindChatTab state={state()} members={[]} selectChannel={() => {}} post={post} />)
  const input = screen.getByLabelText('Message # arca')
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
  ['error', 'The message was not sent. Check your connection and try again.']
] as const)('keeps the draft and explains a %s failure', async (status, message) => {
  const post = vi.fn().mockResolvedValue({ status })
  const { input } = chat(post)
  send(input, 'oi pessoal')
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message))
  expect(input.value).toBe('oi pessoal')
  // The chat itself stays usable: only the message failed.
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
