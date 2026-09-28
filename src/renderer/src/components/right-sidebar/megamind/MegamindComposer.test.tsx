// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MegamindComposer } from './MegamindComposer'
import type { MegamindMember } from '../../../../../shared/arca-megamind-chat'

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
        note: '',
        lastSeen: '2026-01-01 12:00:00Z',
        status: 'idle'
      }
    ]
  },
  { handle: 'daniel', name: 'Daniel', online: false, appOnline: false, sessions: [] }
]

afterEach(cleanup)

function composer(onSend = vi.fn().mockResolvedValue(true)): {
  input: HTMLTextAreaElement
  onSend: ReturnType<typeof vi.fn>
} {
  render(
    <MegamindComposer
      members={members}
      placeholder="Message # arca"
      disabled={false}
      onSend={onSend}
    />
  )
  const input = screen.getByLabelText('Message # arca')
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error('composer input not found')
  }
  return { input, onSend }
}

function type(input: HTMLTextAreaElement, value: string): void {
  fireEvent.change(input, { target: { value, selectionStart: value.length } })
}

it('sends on Enter and keeps Shift+Enter as a newline', async () => {
  const { input, onSend } = composer()
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, shiftKey: true })
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).toHaveBeenCalledWith('oi pessoal')
  await waitFor(() => expect(input.value).toBe(''))
})

it('keeps the draft when the message did not land', async () => {
  const { input, onSend } = composer(vi.fn().mockResolvedValue(false))
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  await waitFor(() => expect(onSend).toHaveBeenCalled())
  expect(input.value).toBe('oi pessoal')
})

it('does not send an empty body', () => {
  const { input, onSend } = composer()
  type(input, '   ')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).not.toHaveBeenCalled()
})

it('suggests the person, the agent and their sessions while an @ mention is typed', async () => {
  const { input, onSend } = composer()
  type(input, 'oi @en')
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    '@enzoEnzo',
    '@enzo-piagent of Enzo',
    'wgs-sistema · pisession of Enzo'
  ])
  fireEvent.mouseDown(screen.getByRole('option', { name: /@enzo-pi/ }))
  await waitFor(() => expect(input.value).toBe('oi @enzo-pi '))
  expect(screen.queryByRole('option')).toBeNull()
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).toHaveBeenCalledWith('oi @enzo-pi')
})

it('keeps Enter on the suggestion list while it is open', () => {
  const { input, onSend } = composer()
  type(input, '@dan')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).not.toHaveBeenCalled()
  expect(input.value).toBe('@daniel ')
})

it('writes the owner’s agent handle when a session is picked', async () => {
  const { input } = composer()
  type(input, '@enzo-')
  fireEvent.mouseDown(screen.getByRole('option', { name: /session of Enzo/ }))
  await waitFor(() => expect(input.value).toBe('@enzo-pi '))
})
