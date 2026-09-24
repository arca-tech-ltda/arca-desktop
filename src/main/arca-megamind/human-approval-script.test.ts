import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { buildHumanApprovalScript } from './human-approval-script'

it('uses human auth only inside the guest and returns no credential or response secrets', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'response-secret' }) })
  const result = await runInNewContext(
    buildHumanApprovalScript(
      'https://mainframe.example',
      '/api/arca/approvals/abcdefghijklmno/decide',
      { decision: 'approved', confirm: true }
    ),
    {
      location: { origin: 'https://mainframe.example' },
      localStorage: { getItem: () => JSON.stringify({ token: 'human-secret' }) },
      fetch: fetcher,
      AbortSignal
    }
  )
  expect(result).toBe('ok')
  expect(fetcher).toHaveBeenCalledWith(
    '/api/arca/approvals/abcdefghijklmno/decide',
    expect.objectContaining({
      redirect: 'error',
      headers: { Authorization: 'human-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', confirm: true })
    })
  )
})

it('refuses a guest that navigated away before execution', async () => {
  const fetcher = vi.fn()
  expect(
    await runInNewContext(
      buildHumanApprovalScript(
        'https://mainframe.example',
        '/api/arca/approvals/abcdefghijklmno/decide',
        { decision: 'denied', confirm: true }
      ),
      {
        location: { origin: 'https://untrusted.example' },
        fetch: fetcher
      }
    )
  ).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

it('requests login when the guest has no human session', async () => {
  const fetcher = vi.fn()
  expect(
    await runInNewContext(
      buildHumanApprovalScript(
        'https://mainframe.example',
        '/api/arca/approvals/abcdefghijklmno/decide',
        { decision: 'denied', confirm: true }
      ),
      {
        location: { origin: 'https://mainframe.example' },
        localStorage: { getItem: () => null },
        fetch: fetcher
      }
    )
  ).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

it('only returns approval presentation fields and flags the human’s own pending approvals', async () => {
  const result = await runInNewContext(
    buildHumanApprovalScript(
      'https://mainframe.example',
      '/api/collections/arca_approvals/records'
    ),
    {
      location: { origin: 'https://mainframe.example' },
      localStorage: {
        getItem: () => JSON.stringify({ token: 'human-secret', record: { id: 'owner' } })
      },
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'abcdefghijklmno',
              summary: 'Push branch',
              owner: 'owner',
              secret: 'must not leave guest'
            }
          ]
        })
      }),
      AbortSignal
    }
  )
  expect(result).toEqual([{ id: 'abcdefghijklmno', summary: 'Push branch', relevant: true }])
})
