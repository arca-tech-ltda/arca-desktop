// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MegamindComposer } from './MegamindComposer'
import { requestMegamindMention } from '@/attention/megamind-panel-route'
import type { MegamindMember } from '../../../../../shared/arca-megamind-chat'

const members: MegamindMember[] = [
  { handle: 'enzo', name: 'Enzo', online: true, appOnline: true, sessions: [] },
  { handle: 'daniel', name: 'Daniel', online: false, appOnline: false, sessions: [] }
]

afterEach(cleanup)

function composer(onSend = vi.fn().mockResolvedValue(undefined)): {
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

it('does not send an empty body', () => {
  const { input, onSend } = composer()
  type(input, '   ')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).not.toHaveBeenCalled()
})

it('suggests the person and the agent while an @ mention is typed, and completes it', async () => {
  const { input, onSend } = composer()
  type(input, 'oi @en')
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    '@enzoEnzo',
    '@enzo-piagent of Enzo'
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

it('picks up the handle the presence tab asked to mention', async () => {
  requestMegamindMention('enzo-pi')
  const { input } = composer()
  await waitFor(() => expect(input.value).toBe('@enzo-pi '))
})
