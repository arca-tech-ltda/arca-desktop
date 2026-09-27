import { beforeEach, expect, it, vi } from 'vitest'
import { MegamindChatService } from './chat-service'
import type { MegamindChatMessage, MegamindChatState } from '../../shared/arca-megamind-chat'

const DM = 'dm:apa0b320to4sf22:bqr1c430up5tg33'

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

type Harness = {
  service: MegamindChatService
  client: {
    identity: ReturnType<typeof vi.fn>
    channels: ReturnType<typeof vi.fn>
    recent: ReturnType<typeof vi.fn>
    history: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
  }
  states: MegamindChatState[]
  alerts: { handle: string; alert: string }[]
}

let harness: Harness

function setup(): Harness {
  const client = {
    identity: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { id: 'me', handle: 'biel', name: '' } }),
    channels: vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { channel: 'arca', kind: 'group', handle: '', name: 'ARCA', lastMessageAt: '', unread: 0 },
        { channel: DM, kind: 'dm', handle: 'enzo', name: 'enzo', lastMessageAt: '', unread: 0 }
      ]
    }),
    recent: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    history: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    post: vi.fn().mockResolvedValue({ ok: true, value: [] })
  }
  const states: MegamindChatState[] = []
  const alerts: { handle: string; alert: string }[] = []
  const service = new MegamindChatService({
    client,
    publish: (state) => states.push(state),
    alert: (item, alert) => alerts.push({ handle: item.authorName, alert }),
    setTimer: () => () => {}
  })
  return { service, client, states, alerts }
}

beforeEach(() => {
  harness = setup()
})

function latest(): MegamindChatState {
  const state = harness.states.at(-1)
  if (!state) {
    throw new Error('No chat state was published')
  }
  return state
}

it('publishes the directory and only notifies about messages that arrive after the first poll', async () => {
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ id: 'old111111111111' })] })
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  expect(latest().channels.map((channel) => channel.channel)).toEqual(['arca', DM])
  expect(harness.alerts).toEqual([])

  harness.client.recent.mockResolvedValue({
    ok: true,
    value: [message({ id: 'old111111111111' }), message({ id: 'new222222222222', channel: DM })]
  })
  await harness.service.refresh()
  expect(harness.alerts).toEqual([{ handle: 'enzo', alert: 'dm' }])
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(1)
})

it('counts unread per channel and clears it when the channel is read', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.recent.mockResolvedValue({
    ok: true,
    value: [message({ id: 'aaaaaaaaaaaaaaa' }), message({ id: 'bbbbbbbbbbbbbbb' })]
  })
  await harness.service.refresh()
  expect(latest().channels.find((channel) => channel.channel === 'arca')?.unread).toBe(2)
  harness.service.markRead('arca')
  expect(latest().channels.find((channel) => channel.channel === 'arca')?.unread).toBe(0)
})

it('does not raise unread or notifications for the channel the user is reading', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.service.setVisible(true)
  await harness.service.setActiveChannel(DM)
  harness.client.recent.mockResolvedValue({
    ok: true,
    value: [message({ id: 'ccccccccccccccc', channel: DM, body: 'oi @biel' })]
  })
  await harness.service.refresh()
  expect(harness.alerts).toEqual([])
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(0)
})

it('loads the active channel history only while the panel is visible', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  expect(harness.client.history).not.toHaveBeenCalled()
  harness.client.history.mockResolvedValue({
    ok: true,
    value: [message({ id: 'ddddddddddddddd' })]
  })
  harness.service.setVisible(true)
  await vi.waitFor(() =>
    expect(latest().messages.map((item) => item.id)).toEqual(['ddddddddddddddd'])
  )
})

it('surfaces a server without chat and a signed-out session without retrying as an error', async () => {
  harness.client.channels.mockResolvedValue({ ok: false, reason: 'unsupported' })
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('unsupported'))

  harness.client.identity.mockResolvedValue({ ok: false, reason: 'login' })
  harness.service.resetSession()
  await vi.waitFor(() => expect(latest().availability).toBe('login'))
})

it('reports a post failure by reason and refreshes after a successful one', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  expect(await harness.service.post('enzo', 'oi')).toEqual({ status: 'ok', woken: [] })
  expect(harness.client.post).toHaveBeenCalledWith('enzo', 'oi')
  harness.client.post.mockResolvedValue({ ok: false, reason: 'login' })
  expect(await harness.service.post('enzo', 'oi')).toEqual({ status: 'login' })
  expect(latest().availability).toBe('login')
})

it('keeps the chat readable when a single post is rejected', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  for (const reason of ['rate', 'tooLong', 'forbidden', 'error'] as const) {
    harness.client.post.mockResolvedValue({ ok: false, reason })
    expect(await harness.service.post('enzo', 'oi')).toEqual({ status: reason })
    expect(latest().availability).toBe('ready')
  }
})

it('passes the agents the server woke back to the caller', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.post.mockResolvedValue({
    ok: true,
    value: [
      { handle: 'enzo', woken: true },
      { handle: 'daniel', woken: false }
    ]
  })
  expect(await harness.service.post('arca', 'oi @enzo-pi @daniel-pi')).toEqual({
    status: 'ok',
    woken: [
      { handle: 'enzo', woken: true },
      { handle: 'daniel', woken: false }
    ]
  })
})

it('asks only for what arrived after the newest message it already read', async () => {
  harness.client.recent.mockResolvedValue({
    ok: true,
    value: [
      message({ id: 'aaaaaaaaaaaaaaa', createdAt: '2026-01-01 00:00:00.000Z' }),
      message({ id: 'bbbbbbbbbbbbbbb', createdAt: '2026-01-02 00:00:00.000Z' })
    ]
  })
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  expect(harness.client.recent).toHaveBeenCalledWith('')
  await harness.service.refresh()
  expect(harness.client.recent).toHaveBeenLastCalledWith('2026-01-02 00:00:00.000Z')
})

it('runs a queued refresh when the channel changes while one is in flight', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.service.setVisible(true)
  await vi.waitFor(() => expect(harness.client.history).toHaveBeenCalled())
  let release = (): void => {}
  harness.client.recent.mockReturnValue(
    new Promise((resolve) => {
      release = () => resolve({ ok: true, value: [] })
    })
  )
  const polls = harness.client.recent.mock.calls.length
  const inFlight = harness.service.refresh()
  const switched = harness.service.setActiveChannel(DM)
  harness.client.recent.mockResolvedValue({ ok: true, value: [] })
  release()
  await Promise.all([inFlight, switched])
  // The switch must earn its own poll instead of waiting for the next scheduled one.
  expect(harness.client.recent.mock.calls.length).toBe(polls + 2)
  expect(harness.client.history).toHaveBeenLastCalledWith(DM)
})
