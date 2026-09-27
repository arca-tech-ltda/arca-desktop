import type { MegamindApproval, MegamindApprovalsResult } from '../../shared/arca-megamind'
import { object } from './credentials'
import { runMainframeUserRequest } from './mainframe-user-guest'

/**
 * Approvals are decided as the human, never with the device credential, so the request runs inside
 * the Mainframe guest that holds the PocketBase session (`mainframe-user-guest.ts`).
 */
export async function pendingApprovals(): Promise<MegamindApprovalsResult> {
  const result = await runMainframeUserRequest({
    path: '/api/collections/arca_approvals/records?filter=status%3D%22pending%22&perPage=100&sort=-created',
    projection: 'approvals'
  }).catch(() => 'error' as const)
  if (result === 'error') {
    return { ok: false, reason: 'error' }
  }
  if (result === 'login') {
    return { ok: false, reason: 'login' }
  }
  if (result.status < 200 || result.status >= 300 || !Array.isArray(result.data)) {
    return { ok: false, reason: 'error' }
  }
  return {
    ok: true,
    items: result.data.filter(
      (item): item is MegamindApproval =>
        object(item) &&
        typeof item.id === 'string' &&
        /^[a-z0-9]{15}$/.test(item.id) &&
        typeof item.summary === 'string'
    )
  }
}

/**
 * `conflict` means the approval was already decided or expired, so the caller must drop it instead
 * of offering the buttons again; `forbidden` means this human may not decide it at all.
 */
export type MegamindDecisionResult = 'ok' | 'login' | 'forbidden' | 'conflict' | 'rate' | 'error'

export async function decideApproval(
  id: string,
  decision: string
): Promise<MegamindDecisionResult> {
  if (!/^[a-z0-9]{15}$/.test(id) || (decision !== 'approved' && decision !== 'denied')) {
    throw new Error('Invalid approval decision')
  }
  const result = await runMainframeUserRequest({
    path: `/api/arca/approvals/${id}/decide`,
    projection: 'ok',
    body: { decision, confirm: true }
  }).catch(() => 'error' as const)
  if (result === 'error') {
    return 'error'
  }
  // The guest reports a missing or expired PocketBase session as `login`, never as a status.
  if (result === 'login') {
    return 'login'
  }
  if (result.status === 403) {
    return 'forbidden'
  }
  if (result.status === 409 || result.status === 410) {
    return 'conflict'
  }
  if (result.status === 429) {
    return 'rate'
  }
  return result.status >= 200 && result.status < 300 && result.data === 'ok' ? 'ok' : 'error'
}
