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
    post: vi.fn().mockResolvedValue({ ok: true, value: 'ok' })
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
  expect(await harness.service.post('enzo', 'oi')).toBe('ok')
  expect(harness.client.post).toHaveBeenCalledWith('enzo', 'oi')
  harness.client.post.mockResolvedValue({ ok: false, reason: 'login' })
  expect(await harness.service.post('enzo', 'oi')).toBe('login')
  expect(latest().availability).toBe('login')
})
