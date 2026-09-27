import { describe, expect, it, vi } from 'vitest'
import { MegamindChatClient } from './chat-client'
import type { MainframeUserRunner } from './mainframe-user-guest'

const message = (fields: Record<string, unknown>): Record<string, unknown> => ({
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

function client(runner: MainframeUserRunner): MegamindChatClient {
  return new MegamindChatClient(runner)
}

describe('chat reads', () => {
  it('asks the collection for one channel and returns it oldest first', async () => {
    const run = vi.fn<MainframeUserRunner>().mockResolvedValue({
      status: 200,
      data: [
        message({ id: 'bbbbbbbbbbbbbbb', createdAt: '2026-01-02T00:00:00Z' }),
        message({ id: 'aaaaaaaaaaaaaaa', createdAt: '2026-01-01T00:00:00Z' })
      ]
    })
    const result = await client(run).history('dm:apa0b320to4sf22:bqr1c430up5tg33')
    expect(result).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ id: 'aaaaaaaaaaaaaaa' }),
        expect.objectContaining({ id: 'bbbbbbbbbbbbbbb' })
      ]
    })
    const request = run.mock.calls[0][0]
    const path = request === 'identity' ? '' : request.path
    expect(path).toContain('filter=channel%3D%22dm%3Aapa0b320to4sf22%3Abqr1c430up5tg33%22')
    expect(path).toContain('sort=-created')
  })

  it('refuses a channel id that is not the group or a DM', async () => {
    const run = vi.fn<MainframeUserRunner>()
    expect(await client(run).history('dm:../etc')).toEqual({ ok: false, reason: 'error' })
    expect(run).not.toHaveBeenCalled()
  })

  it('drops records the server did not shape as a chat message', async () => {
    const run = vi.fn<MainframeUserRunner>().mockResolvedValue({
      status: 200,
      data: [message({}), { id: 'x' }, message({ channel: 'x' })]
    })
    const result = await client(run).recent()
    expect(result.ok && result.value).toHaveLength(1)
  })

  it('reads a 404 as a server without chat and a missing session as login', async () => {
    expect(await client(vi.fn().mockResolvedValue({ status: 404, data: null })).channels()).toEqual(
      {
        ok: false,
        reason: 'unsupported'
      }
    )
    expect(await client(vi.fn().mockResolvedValue('login')).channels()).toEqual({
      ok: false,
      reason: 'login'
    })
    expect(await client(vi.fn().mockRejectedValue(new Error('offline'))).channels()).toEqual({
      ok: false,
      reason: 'error'
    })
  })

  it('keeps only channels the contract can address', async () => {
    const run = vi.fn<MainframeUserRunner>().mockResolvedValue({
      status: 200,
      data: [
        { channel: 'arca', kind: 'group', handle: '', name: 'ARCA', lastMessageAt: '2026-01-01Z' },
        { channel: 'dm:apa0b320to4sf22:bqr1c430up5tg33', kind: 'dm', handle: 'enzo', name: '' },
        { channel: 'dm:apa0b320to4sf22:bqr1c430up5tg33', kind: 'dm', handle: 'NOPE', name: '' },
        { channel: 'project:x', kind: 'dm', handle: 'enzo', name: '' }
      ]
    })
    const result = await client(run).channels()
    expect(result.ok && result.value).toEqual([
      expect.objectContaining({ channel: 'arca', kind: 'group', name: 'ARCA' }),
      expect.objectContaining({ kind: 'dm', handle: 'enzo', name: 'enzo' })
    ])
  })
})

describe('chat writes', () => {
  it('posts to the human route addressed by group or handle', async () => {
    const run = vi.fn<MainframeUserRunner>().mockResolvedValue({ status: 200, data: 'ok' })
    expect(await client(run).post('enzo', 'oi')).toEqual({ ok: true, value: 'ok' })
    expect(run).toHaveBeenCalledWith({
      path: '/api/arca/chat',
      projection: 'ok',
      body: { channel: 'enzo', body: 'oi' }
    })
  })

  it('rejects an unaddressable target or a body outside the contract before any request', async () => {
    const run = vi.fn<MainframeUserRunner>()
    expect(await client(run).post('dm:apa0b320to4sf22:bqr1c430up5tg33', 'oi')).toEqual({
      ok: false,
      reason: 'error'
    })
    expect(await client(run).post('arca', '')).toEqual({ ok: false, reason: 'error' })
    expect(await client(run).post('arca', 'x'.repeat(8193))).toEqual({ ok: false, reason: 'error' })
    expect(run).not.toHaveBeenCalled()
  })
})
