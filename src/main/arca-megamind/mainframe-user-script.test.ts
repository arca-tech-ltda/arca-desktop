import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { buildMainframeIdentityScript, buildMainframeUserScript } from './mainframe-user-script'

const origin = 'https://mainframe.example'

function guest(options: {
  auth?: unknown
  fetch?: unknown
  location?: string
}): Record<string, unknown> {
  return {
    location: { origin: options.location ?? origin },
    localStorage: {
      getItem: () =>
        options.auth === undefined
          ? JSON.stringify({ token: 'human-secret', record: { id: 'owner' } })
          : options.auth === null
            ? null
            : JSON.stringify(options.auth)
    },
    fetch: options.fetch,
    AbortSignal
  }
}

const response = (status: number, body: unknown): unknown => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
})

it('uses the human session inside the guest and returns no credential or response secrets', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(200, { token: 'response-secret' }))
  const result = await runInNewContext(
    buildMainframeUserScript({
      origin,
      path: '/api/arca/approvals/abcdefghijklmno/decide',
      projection: 'ok',
      body: { decision: 'approved', confirm: true }
    }),
    guest({ fetch: fetcher })
  )
  expect(result).toEqual({ status: 200, data: 'ok' })
  expect(fetcher).toHaveBeenCalledWith(
    '/api/arca/approvals/abcdefghijklmno/decide',
    expect.objectContaining({
      redirect: 'error',
      headers: { Authorization: 'human-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', confirm: true })
    })
  )
})

it('refuses a guest that navigated away and one without a human session', async () => {
  const fetcher = vi.fn()
  const script = buildMainframeUserScript({ origin, path: '/api/arca/chat', projection: 'ok' })
  expect(
    await runInNewContext(script, guest({ fetch: fetcher, location: 'https://untrusted.example' }))
  ).toBeNull()
  expect(await runInNewContext(script, guest({ auth: null, fetch: fetcher }))).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

it('reports the status so an expired session and a server without chat stay distinguishable', async () => {
  const script = buildMainframeUserScript({
    origin,
    path: '/api/arca/chat/channels',
    projection: 'chatChannels'
  })
  expect(await runInNewContext(script, guest({ fetch: async () => response(401, {}) }))).toBeNull()
  expect(await runInNewContext(script, guest({ fetch: async () => response(404, {}) }))).toEqual({
    status: 404,
    data: null
  })
})

it('projects only presentation fields and flags the viewer’s own rows', async () => {
  expect(
    await runInNewContext(
      buildMainframeUserScript({
        origin,
        path: '/api/collections/arca_approvals/records',
        projection: 'approvals'
      }),
      guest({
        fetch: async () =>
          response(200, {
            items: [
              { id: 'abcdefghijklmno', summary: 'Push branch', owner: 'owner', secret: 'stays' }
            ]
          })
      })
    )
  ).toEqual({
    status: 200,
    data: [{ id: 'abcdefghijklmno', summary: 'Push branch', relevant: true }]
  })
  expect(
    await runInNewContext(
      buildMainframeUserScript({
        origin,
        path: '/api/collections/arca_chat_messages/records',
        projection: 'chatMessages'
      }),
      guest({
        fetch: async () =>
          response(200, {
            items: [
              {
                id: 'abcdefghijklmno',
                channel: 'arca',
                author_kind: 'agent',
                author_name: 'enzo',
                author_label: 'session',
                body: 'oi @biel',
                mentions: ['biel'],
                created: '2026-01-01 00:00:00Z',
                author: 'owner',
                expires_at: 'stays'
              }
            ]
          })
      })
    )
  ).toEqual({
    status: 200,
    data: [
      {
        id: 'abcdefghijklmno',
        channel: 'arca',
        authorKind: 'agent',
        authorName: 'enzo',
        authorLabel: 'session',
        body: 'oi @biel',
        mentions: ['biel'],
        createdAt: '2026-01-01 00:00:00Z',
        mine: true
      }
    ]
  })
})

it('projects which mentioned agents the chat route woke', async () => {
  const script = buildMainframeUserScript({
    origin,
    path: '/api/arca/chat',
    projection: 'chatPost',
    body: { channel: 'arca', body: 'oi @enzo-pi' }
  })
  expect(
    await runInNewContext(
      script,
      guest({
        fetch: async () =>
          response(200, {
            id: 'abcdefghijklmno',
            woken: ['enzo', { handle: 'daniel', woken: false }, { handle: 'ana', awake: false }]
          })
      })
    )
  ).toEqual({
    status: 200,
    data: [
      { handle: 'enzo', woken: true },
      { handle: 'daniel', woken: false },
      { handle: 'ana', woken: false }
    ]
  })
  expect(
    await runInNewContext(script, guest({ fetch: async () => response(200, { id: 'x' }) }))
  ).toEqual({ status: 200, data: [] })
})

it('reads the handle from the session, falling back to the e-mail local part', async () => {
  expect(
    await runInNewContext(
      buildMainframeIdentityScript(origin),
      guest({ auth: { token: 't', record: { id: 'owner', handle: 'biel', name: 'Biel' } } })
    )
  ).toEqual({ status: 200, data: { id: 'owner', handle: 'biel', name: 'Biel' } })
  expect(
    await runInNewContext(
      buildMainframeIdentityScript(origin),
      guest({ auth: { token: 't', record: { id: 'owner', email: 'enzo@arca.com' } } })
    )
  ).toEqual({ status: 200, data: { id: 'owner', handle: 'enzo', name: '' } })
})
