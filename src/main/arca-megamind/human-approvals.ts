import { buildHumanApprovalScript } from './human-approval-script'
import { session, webContents, type WebContents } from 'electron'
import { ARCA_MAINFRAME_PARTITION } from '../../shared/arca-mainframe'
import type { MegamindApproval } from '../../shared/arca-megamind'
import { getArcaMainframeEndpoint } from '../arca-mainframe/arca-mainframe-endpoint'
import { object } from './credentials'

function guestFor(sender: WebContents): WebContents | undefined {
  const origin = getArcaMainframeEndpoint().origin
  return webContents.getAllWebContents().find((guest) => {
    if (
      guest.getType() !== 'webview' ||
      guest.hostWebContents !== sender ||
      guest.session !== session.fromPartition(ARCA_MAINFRAME_PARTITION)
    ) {
      return false
    }
    try {
      return new URL(guest.getURL()).origin === origin
    } catch {
      return false
    }
  })
}

async function humanFetch(sender: WebContents, path: string, body?: unknown): Promise<unknown> {
  const guest = guestFor(sender)
  if (!guest) {
    return null
  }
  return guest.executeJavaScript(
    buildHumanApprovalScript(getArcaMainframeEndpoint().origin, path, body)
  )
}

export async function pendingApprovals(sender: WebContents): Promise<MegamindApproval[]> {
  const result = await humanFetch(
    sender,
    '/api/collections/arca_approvals/records?filter=status%3D%22pending%22&perPage=100&sort=-created'
  )
  if (!Array.isArray(result)) {
    return []
  }
  return result.filter(
    (item): item is MegamindApproval =>
      object(item) &&
      typeof item.id === 'string' &&
      /^[a-z0-9]{15}$/.test(item.id) &&
      typeof item.summary === 'string'
  )
}

export async function decideApproval(
  sender: WebContents,
  id: string,
  decision: string
): Promise<'ok' | 'login'> {
  if (!/^[a-z0-9]{15}$/.test(id) || (decision !== 'approved' && decision !== 'denied')) {
    throw new Error('Invalid approval decision')
  }
  const result = await humanFetch(sender, `/api/arca/approvals/${id}/decide`, {
    decision,
    confirm: true
  })
  if (result === 'ok') {
    return 'ok'
  }
  const guest = guestFor(sender)
  if (guest) {
    await guest.loadURL(getArcaMainframeEndpoint().panelUrl)
  }
  return 'login'
}
