import type { MegamindApproval } from '../../shared/arca-megamind'
import { object } from './credentials'
import { runMainframeUserRequest } from './mainframe-user-guest'

/**
 * Approvals are decided as the human, never with the device credential, so the request runs inside
 * the Mainframe guest that holds the PocketBase session (`mainframe-user-guest.ts`).
 */
export async function pendingApprovals(): Promise<MegamindApproval[]> {
  const result = await runMainframeUserRequest({
    path: '/api/collections/arca_approvals/records?filter=status%3D%22pending%22&perPage=100&sort=-created',
    projection: 'approvals'
  }).catch(() => 'login' as const)
  if (result === 'login' || !Array.isArray(result.data)) {
    return []
  }
  return result.data.filter(
    (item): item is MegamindApproval =>
      object(item) &&
      typeof item.id === 'string' &&
      /^[a-z0-9]{15}$/.test(item.id) &&
      typeof item.summary === 'string'
  )
}

export async function decideApproval(id: string, decision: string): Promise<'ok' | 'login'> {
  if (!/^[a-z0-9]{15}$/.test(id) || (decision !== 'approved' && decision !== 'denied')) {
    throw new Error('Invalid approval decision')
  }
  const result = await runMainframeUserRequest({
    path: `/api/arca/approvals/${id}/decide`,
    projection: 'ok',
    body: { decision, confirm: true }
  })
  return result !== 'login' && result.data === 'ok' ? 'ok' : 'login'
}
