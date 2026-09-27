import { beforeEach, expect, it, vi } from 'vitest'

const run = vi.fn()
vi.mock('./mainframe-user-guest', () => ({ runMainframeUserRequest: run }))

const { decideApproval, pendingApprovals } = await import('./human-approvals')

beforeEach(() => run.mockReset())

it('tells a decision that landed from every way it can fail', async () => {
  const cases: [unknown, string][] = [
    [{ status: 200, data: 'ok' }, 'ok'],
    ['login', 'login'],
    [{ status: 403, data: null }, 'forbidden'],
    [{ status: 409, data: null }, 'conflict'],
    [{ status: 410, data: null }, 'conflict'],
    [{ status: 429, data: null }, 'rate'],
    [{ status: 500, data: null }, 'error']
  ]
  for (const [result, expected] of cases) {
    run.mockResolvedValueOnce(result)
    expect(await decideApproval('abcdefghijklmno', 'approved')).toBe(expected)
  }
  run.mockRejectedValueOnce(new Error('offline'))
  expect(await decideApproval('abcdefghijklmno', 'denied')).toBe('error')
})

it('refuses an id or a decision the route would not accept', async () => {
  await expect(decideApproval('../etc', 'approved')).rejects.toThrow()
  await expect(decideApproval('abcdefghijklmno', 'maybe')).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

it('separates an empty approvals list from a read that never happened', async () => {
  run.mockResolvedValueOnce({ status: 200, data: [] })
  expect(await pendingApprovals()).toEqual({ ok: true, items: [] })
  run.mockResolvedValueOnce({
    status: 200,
    data: [{ id: 'abcdefghijklmno', summary: 'Push branch' }, { id: 'nope' }]
  })
  expect(await pendingApprovals()).toEqual({
    ok: true,
    items: [{ id: 'abcdefghijklmno', summary: 'Push branch' }]
  })
  run.mockRejectedValueOnce(new Error('offline'))
  expect(await pendingApprovals()).toEqual({ ok: false, reason: 'error' })
  run.mockResolvedValueOnce('login')
  expect(await pendingApprovals()).toEqual({ ok: false, reason: 'login' })
  run.mockResolvedValueOnce({ status: 500, data: null })
  expect(await pendingApprovals()).toEqual({ ok: false, reason: 'error' })
})
