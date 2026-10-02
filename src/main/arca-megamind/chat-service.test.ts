import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { MegamindChatService, type MegamindChatTransport } from './chat-service'
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
  client: { [K in keyof MegamindChatTransport]: Mock<MegamindChatTransport[K]> }
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
  harness.service.setVisible(true, 'arca')
  await vi.waitFor(() => expect(harness.client.history).toHaveBeenCalled())
  await harness.service.refresh()
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

it('does not notify again about a message a previous run already alerted on', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  const dm = message({ id: 'new222222222222', channel: DM })
  harness.client.recent.mockResolvedValue({ ok: true, value: [dm] })
  await harness.service.refresh()
  expect(harness.alerts).toEqual([{ handle: 'enzo', alert: 'dm' }])

  // A restart: a fresh service, and the server still serves the same tail of the channel.
  const restarted = setup()
  restarted.client.recent.mockResolvedValue({ ok: true, value: [dm] })
  restarted.service.start()
  await vi.waitFor(() => expect(restarted.states.at(-1)?.availability).toBe('ready'))
  await restarted.service.refresh()
  expect(restarted.alerts).toEqual([])
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('never publishes delayed history under another channel or session', async () => {
  harness.service.setVisible(true, 'arca')
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  for (const reset of [false, true]) {
    const gate = deferred<{ ok: true; value: MegamindChatMessage[] }>()
    harness.client.history.mockReturnValueOnce(gate.promise)
    const calls = harness.client.history.mock.calls.length
    const pending = harness.service.refresh()
    await vi.waitFor(() => expect(harness.client.history.mock.calls.length).toBe(calls + 1))
    if (reset) {
      harness.service.resetSession()
    } else {
      await harness.service.setActiveChannel(DM)
    }
    const start = harness.states.length
    gate.resolve({ ok: true, value: [message({ body: 'stale history' })] })
    await pending
    expect(harness.states.slice(start).flatMap((state) => state.messages)).not.toContainEqual(
      message({ body: 'stale history' })
    )
  }
})

it('discards a delayed identity and clears all user state on session reset', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ channel: DM })] })
  await harness.service.refresh()
  await harness.service.setActiveChannel(DM)
  const gate = deferred<{ ok: true; value: { id: string; handle: string; name: string } }>()
  harness.client.identity.mockReturnValueOnce(gate.promise)
  harness.service.resetSession()
  expect(latest()).toMatchObject({
    viewerHandle: '',
    activeChannel: 'arca',
    channels: [],
    messages: []
  })
  harness.client.identity.mockResolvedValue({
    ok: true,
    value: { id: 'new', handle: 'leo', name: '' }
  })
  harness.service.resetSession()
  const start = harness.states.length
  gate.resolve({ ok: true, value: { id: 'old', handle: 'old', name: '' } })
  await vi.waitFor(() => expect(latest().viewerHandle).toBe('leo'))
  expect(harness.states.slice(start).some((state) => state.viewerHandle === 'old')).toBe(false)
  harness.client.recent.mockResolvedValue({ ok: true, value: [] })
  await harness.service.refresh()
  expect(latest().channels.every((channel) => channel.unread === 0)).toBe(true)
})

it('returns the post acknowledgement without waiting for history or inventing a message', async () => {
  harness.service.setVisible(true, 'arca')
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  const gate = deferred<{ ok: true; value: MegamindChatMessage[] }>()
  harness.client.history.mockReturnValueOnce(gate.promise)
  expect(await harness.service.post('arca', 'sent')).toEqual({ status: 'ok', woken: [] })
  expect(latest().messages).toEqual([])
  gate.resolve({ ok: true, value: [] })
})

it('polls channels and recent concurrently while retaining channel failure precedence', async () => {
  const gate = deferred<{ ok: false; reason: 'unsupported' }>()
  harness.client.channels.mockReturnValue(gate.promise)
  harness.client.recent.mockResolvedValue({ ok: false, reason: 'error' })
  harness.service.start()
  await vi.waitFor(() => expect(harness.client.recent).toHaveBeenCalled())
  gate.resolve({ ok: false, reason: 'unsupported' })
  await vi.waitFor(() => expect(latest().availability).toBe('unsupported'))
})

it('keeps list and unfocused conversations unread; selection alone is not reading', async () => {
  harness.service.setVisible(true, null)
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ channel: DM })] })
  await harness.service.refresh()
  await harness.service.setActiveChannel(DM)
  harness.service.markRead(DM)
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(1)
  expect(harness.alerts).toHaveLength(1)
  harness.service.setVisible(true, DM)
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(0)
})

it('coalesces change hints and retains the visible and background fallback timers', async () => {
  const timer = vi.fn(() => () => {})
  const service = new MegamindChatService({
    client: harness.client,
    publish: () => {},
    alert: () => {},
    setTimer: timer
  })
  service.start()
  await vi.waitFor(() => expect(timer).toHaveBeenLastCalledWith(expect.any(Function), 30_000))
  const gate = deferred<{ ok: true; value: MegamindChatMessage[] }>()
  harness.client.recent.mockReturnValueOnce(gate.promise)
  const count = harness.client.recent.mock.calls.length
  const pending = service.refresh()
  for (let i = 0; i < 10; i++) {
    void service.refresh()
  }
  service.setVisible(true, null)
  gate.resolve({ ok: true, value: [] })
  await pending
  expect(harness.client.recent.mock.calls.length).toBe(count + 2)
  expect(timer).toHaveBeenLastCalledWith(expect.any(Function), 5_000)
  service.stop()
})

it('ignores old-session recent results and post failures after a reset', async () => {
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  const recent = deferred<{ ok: true; value: MegamindChatMessage[] }>()
  const post = deferred<{ ok: false; reason: 'login' }>()
  harness.client.recent.mockReturnValueOnce(recent.promise)
  harness.client.post.mockReturnValueOnce(post.promise)
  const refresh = harness.service.refresh()
  const sending = harness.service.post('arca', 'sent')
  harness.service.resetSession()
  recent.resolve({ ok: true, value: [message({ channel: DM })] })
  await refresh
  expect(harness.alerts).toEqual([])
  expect(latest().channels.every((channel) => channel.unread === 0)).toBe(true)
  post.resolve({ ok: false, reason: 'login' })
  expect(await sending).toEqual({ status: 'login' })
  expect(latest().availability).toBe('ready')
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ channel: DM })] })
  await harness.service.refresh()
  expect(harness.alerts).toHaveLength(1)
})

it('preserves requested reading across session resets without retaining private history', async () => {
  harness.service.setVisible(true, 'arca')
  harness.service.start()
  await vi.waitFor(() => expect(latest().historyLoading).toBe(false))
  harness.service.resetSession()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ mentions: ['biel'] })] })
  await harness.service.refresh()
  expect(harness.alerts).toEqual([])
  expect(latest().channels[0].unread).toBe(0)
})

it('keeps switched history loading and unread until a matching successful fetch', async () => {
  harness.service.setVisible(true, null)
  harness.service.start()
  await vi.waitFor(() => expect(latest().historyLoading).toBe(false))
  harness.client.recent.mockResolvedValue({ ok: true, value: [message({ channel: DM })] })
  await harness.service.refresh()
  harness.client.recent.mockResolvedValue({ ok: true, value: [] })
  harness.client.history.mockResolvedValue({ ok: false, reason: 'error' })
  await harness.service.setActiveChannel(DM)
  harness.service.setVisible(true, DM)
  await harness.service.refresh()
  expect(latest()).toMatchObject({ availability: 'ready', historyLoading: true, messages: [] })
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(1)
  harness.client.history.mockRejectedValueOnce(new Error('offline'))
  await harness.service.refresh()
  expect(latest().historyLoading).toBe(true)
  harness.client.history.mockResolvedValue({ ok: true, value: [message({ channel: DM })] })
  await harness.service.refresh()
  await vi.waitFor(() => expect(latest().historyLoading).toBe(false))
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(0)
})

it('does not publish or consume a history response after stop', async () => {
  harness.service.setVisible(true, 'arca')
  harness.service.start()
  await vi.waitFor(() => expect(latest().historyLoading).toBe(false))
  const gate = deferred<{ ok: true; value: MegamindChatMessage[] }>()
  harness.client.history.mockReturnValueOnce(gate.promise)
  const calls = harness.client.history.mock.calls.length
  const pending = harness.service.refresh()
  await vi.waitFor(() => expect(harness.client.history.mock.calls.length).toBe(calls + 1))
  harness.service.stop()
  const count = harness.states.length
  gate.resolve({ ok: true, value: [message({})] })
  await pending
  expect(harness.states).toHaveLength(count)
})

it('shows fallback messages after history fails without treating them as read', async () => {
  harness.service.setVisible(true, null)
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  const dm = message({ id: 'fallbackmessage1', channel: DM })
  harness.client.recent.mockResolvedValue({ ok: true, value: [dm] })
  await harness.service.refresh()
  harness.client.history.mockResolvedValue({ ok: false, reason: 'error' })
  await harness.service.setActiveChannel(DM)
  harness.service.setVisible(true, DM)
  expect(latest()).toMatchObject({ historyLoading: false, messages: [dm] })
  expect(latest().channels.find((channel) => channel.channel === DM)?.unread).toBe(1)
})

it('uses the background interval after an availability error even while visible', async () => {
  const timer = vi.fn(() => () => {})
  harness.client.channels.mockResolvedValue({ ok: false, reason: 'error' })
  const service = new MegamindChatService({
    client: harness.client,
    publish: () => {},
    alert: () => {},
    setTimer: timer
  })
  service.setVisible(true, 'arca')
  service.start()
  await vi.waitFor(() => expect(timer).toHaveBeenLastCalledWith(expect.any(Function), 30_000))
  service.stop()
})

it('adds a read-only unread row for a DM missing from the directory', async () => {
  harness.client.channels.mockResolvedValue({ ok: true, value: [] })
  harness.service.start()
  await vi.waitFor(() => expect(latest().availability).toBe('ready'))
  harness.client.recent.mockResolvedValue({
    ok: true,
    value: [
      message({ channel: DM, authorKind: 'agent', authorName: 'enzo-pi', authorLabel: 'Enzo' })
    ]
  })
  await harness.service.refresh()
  expect(latest().channels).toEqual([
    expect.objectContaining({ channel: DM, kind: 'dm', handle: '', name: 'Enzo', unread: 1 })
  ])

  harness.client.channels.mockResolvedValue({
    ok: true,
    value: [
      {
        channel: DM,
        kind: 'dm',
        handle: 'enzo',
        name: 'Canonical',
        lastMessageAt: '',
        lastMessageBody: '',
        unread: 0
      }
    ]
  })
  harness.client.recent.mockResolvedValue({ ok: true, value: [] })
  await harness.service.refresh()
  expect(latest().channels).toEqual([
    expect.objectContaining({ channel: DM, handle: 'enzo', name: 'Canonical', unread: 1 })
  ])
})
