// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MegamindComposer } from './MegamindComposer'
import { clearMegamindComposerDrafts } from './megamind-composer-drafts'
import type { MegamindMember } from '../../../../../shared/arca-megamind-chat'

const members: MegamindMember[] = [
  {
    handle: 'enzo',
    name: 'jabiscreidisom',
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

afterEach(() => {
  cleanup()
  clearMegamindComposerDrafts('composer-test')
})

function composer(
  onSend = vi.fn().mockResolvedValue(true),
  channel = 'arca'
): {
  input: HTMLTextAreaElement
  onSend: ReturnType<typeof vi.fn>
} {
  render(
    <MegamindComposer
      channel={channel}
      draftScope="composer-test"
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

function textarea(label: string): HTMLTextAreaElement {
  const input = screen.getByLabelText(label)
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error('composer input not found')
  }
  return input
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

it('disables editing while sending and restores focus after the ack', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish
      })
  )
  const { input } = composer(onSend)
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  await waitFor(() => {
    expect(input.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Sending…' })).toHaveProperty('disabled', true)
  })
  resolve(true)
  await waitFor(() => {
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })
})

it('does not submit twice while a channel send is pending', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish
      })
  )
  const { input } = composer(onSend)
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(onSend).toHaveBeenCalledTimes(1)
  resolve(true)
  await waitFor(() => expect(input.value).toBe(''))
})

it('delays the sending label and spinner together', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish
      })
  )
  const { input } = composer(onSend)
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sending…' })).toBeTruthy())
  resolve(true)
  await waitFor(() => expect(input.value).toBe(''))
})

it('restores focus after a failed send when the input owned the submit', async () => {
  const onSend = vi.fn().mockResolvedValue(false)
  const { input } = composer(onSend)
  input.focus()
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  await waitFor(() => expect(onSend).toHaveBeenCalled())
  await waitFor(() => expect(document.activeElement).toBe(input))
  expect(input.value).toBe('oi pessoal')
})

it('does not reclaim focus from another control after a pending send', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish
      })
  )
  const rendered = render(
    <>
      <button type="button">Other control</button>
      <MegamindComposer
        channel="arca"
        draftScope="composer-test"
        members={members}
        placeholder="Message # arca"
        disabled={false}
        onSend={onSend}
      />
    </>
  )
  const input = textarea('Message # arca')
  input.focus()
  type(input, 'oi pessoal')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  const other = screen.getByRole('button', { name: 'Other control' })
  other.focus()
  resolve(true)
  await waitFor(() => expect(input.value).toBe(''))
  expect(document.activeElement).toBe(other)
  rendered.unmount()
})

it('keeps drafts isolated when the channel changes during a pending send', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish
      })
  )
  const rendered = render(
    <MegamindComposer
      channel="arca"
      draftScope="composer-test"
      members={members}
      placeholder="Message # arca"
      disabled={false}
      onSend={onSend}
    />
  )
  const input = textarea('Message # arca')
  type(input, 'mensagem privada')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('mensagem privada'))

  rendered.rerender(
    <MegamindComposer
      channel="dm:enzo"
      draftScope="composer-test"
      members={members}
      placeholder="Message @enzo"
      disabled={false}
      onSend={onSend}
    />
  )
  const dmInput = textarea('Message @enzo')
  expect(dmInput).toHaveProperty('disabled', false)
  type(dmInput, 'não enviar no grupo')
  resolve(true)
  await waitFor(() => expect(dmInput.value).toBe('não enviar no grupo'))
  rendered.rerender(
    <MegamindComposer
      channel="arca"
      draftScope="composer-test"
      members={members}
      placeholder="Message # arca"
      disabled={false}
      onSend={onSend}
    />
  )
  expect(screen.getByLabelText('Message # arca')).toHaveProperty('value', '')
  rendered.rerender(
    <MegamindComposer
      channel="dm:enzo"
      draftScope="composer-test"
      members={members}
      placeholder="Message @enzo"
      disabled={false}
      onSend={onSend}
    />
  )
  expect(screen.getByLabelText('Message @enzo')).toHaveProperty('value', 'não enviar no grupo')
})

it('does not submit the confirming Enter from an IME composition', () => {
  const { input, onSend } = composer()
  fireEvent.compositionStart(input)
  type(input, '日本語')
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true })
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input)
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
    '@enzo',
    '@enzo-piagent of enzo',
    'wgs-sistema · pisession of enzo'
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
  fireEvent.mouseDown(screen.getByRole('option', { name: /session of enzo/ }))
  await waitFor(() => expect(input.value).toBe('@enzo-pi '))
})
