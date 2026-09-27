// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import type { MegamindApprovalsResult, MegamindDecision } from '../../../shared/arca-megamind'
import type * as ApprovalsStore from './megamind-approvals-store'

type Store = typeof ApprovalsStore

const approvals = vi.fn<() => Promise<MegamindApprovalsResult>>()
const decide = vi.fn<() => Promise<MegamindDecision>>()

async function store(): Promise<Store> {
  vi.resetModules()
  return import('./megamind-approvals-store')
}

beforeEach(() => {
  approvals.mockReset()
  decide.mockReset()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the store reads only these two members of the preload API.
  ;(window as unknown as { api: unknown }).api = { arcaMegamind: { approvals, decide } }
})

it('reports a failed read instead of an empty approvals list', async () => {
  const { megamindApprovalsSnapshot, refreshMegamindApprovals } = await store()
  approvals.mockResolvedValue({ ok: false, reason: 'error' })
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().problem).toBe('transport'))
  expect(megamindApprovalsSnapshot().login).toBe(false)

  approvals.mockResolvedValue({ ok: false, reason: 'login' })
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().login).toBe(true))
  expect(megamindApprovalsSnapshot().problem).toBe('transport')

  approvals.mockResolvedValue({ ok: true, items: [{ id: 'abcdefghijklmno', summary: 'Push' }] })
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().problem).toBeNull())
  expect(megamindApprovalsSnapshot().items).toHaveLength(1)
})

it('keeps the last list when the poll cannot reach the Mainframe', async () => {
  const { megamindApprovalsSnapshot, refreshMegamindApprovals } = await store()
  approvals.mockResolvedValue({ ok: true, items: [{ id: 'abcdefghijklmno', summary: 'Push' }] })
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().items).toHaveLength(1))
  approvals.mockRejectedValue(new Error('offline'))
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().problem).toBe('transport'))
  expect(megamindApprovalsSnapshot().items).toHaveLength(1)
})

it('tells each way a decision can be refused apart', async () => {
  const { decideMegamindApproval, megamindApprovalsSnapshot, refreshMegamindApprovals } =
    await store()
  approvals.mockResolvedValue({
    ok: true,
    items: [
      { id: 'abcdefghijklmno', summary: 'Push' },
      { id: 'bbbbbbbbbbbbbbb', summary: 'Merge' }
    ]
  })
  refreshMegamindApprovals()
  await vi.waitFor(() => expect(megamindApprovalsSnapshot().items).toHaveLength(2))

  decide.mockResolvedValue('login')
  expect(await decideMegamindApproval('abcdefghijklmno', 'approved')).toBe('login')
  expect(megamindApprovalsSnapshot()).toMatchObject({ login: true, problem: null })
  expect(megamindApprovalsSnapshot().items).toHaveLength(2)

  decide.mockResolvedValue('forbidden')
  expect(await decideMegamindApproval('abcdefghijklmno', 'approved')).toBe('forbidden')
  expect(megamindApprovalsSnapshot().problem).toBe('forbidden')
  expect(megamindApprovalsSnapshot().items).toHaveLength(2)

  decide.mockResolvedValue('rate')
  expect(await decideMegamindApproval('abcdefghijklmno', 'approved')).toBe('rate')
  expect(megamindApprovalsSnapshot().problem).toBe('rate')

  // Already decided or expired: the item cannot be decided again, so it leaves the list.
  decide.mockResolvedValue('conflict')
  expect(await decideMegamindApproval('abcdefghijklmno', 'approved')).toBe('conflict')
  expect(megamindApprovalsSnapshot().problem).toBe('conflict')
  expect(megamindApprovalsSnapshot().items.map((item) => item.id)).toEqual(['bbbbbbbbbbbbbbb'])

  decide.mockResolvedValue('ok')
  expect(await decideMegamindApproval('bbbbbbbbbbbbbbb', 'denied')).toBe('ok')
  expect(megamindApprovalsSnapshot()).toMatchObject({ items: [], problem: null, login: false })

  decide.mockRejectedValue(new Error('offline'))
  expect(await decideMegamindApproval('abcdefghijklmno', 'denied')).toBe('error')
  expect(megamindApprovalsSnapshot().problem).toBe('decide')
})
