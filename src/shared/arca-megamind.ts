import type { ArcaDeepLink } from './arca-deep-link'
import type {
  MegamindChatPostResult,
  MegamindChatState,
  MegamindMembers
} from './arca-megamind-chat'

export type MegamindRecord = Record<string, unknown>
export type MegamindStatus = {
  state: 'disconnected' | 'pending' | 'connected' | 'expired' | 'error'
  device?: string
  userCode?: string
  verificationUri?: string
}
export type MegamindApproval = {
  id: string
  summary: string
  relevant?: boolean
}

/** A failed read is not an empty list: the panel must say so instead of "no approvals". */
export type MegamindApprovalsResult =
  | { ok: true; items: MegamindApproval[] }
  | { ok: false; reason: 'login' | 'error' }

export type MegamindDecision = 'ok' | 'login' | 'forbidden' | 'conflict' | 'rate' | 'error'

export type MegamindSubTab = 'chat' | 'presence' | 'approvals'

/** Where a notification or deep link wants the Megamind panel to land. */
export type MegamindPanelRoute = {
  tab: MegamindSubTab
  channel?: string
  approvalId?: string
}
export type MegamindPrerequisites = {
  /** Which agent the Megamind link is checked for on this machine. */
  mode: 'pi' | 'managed'
  /** Pi with its Megamind extension (`pi`), or the Claude Code/Codex MCP proxy (`managed`). */
  agent: boolean
  installer: boolean
  windows: boolean
}
export type ArcaMegamindApi = {
  prerequisites(): Promise<MegamindPrerequisites>
  status(): Promise<MegamindStatus>
  startEnrollment(): Promise<MegamindStatus>
  agents(): Promise<MegamindRecord[]>
  requests(): Promise<MegamindRecord[]>
  approvals(): Promise<MegamindApprovalsResult>
  decide(id: string, decision: 'approved' | 'denied'): Promise<MegamindDecision>
  chatState(): Promise<MegamindChatState>
  chatSetVisible(visible: boolean): Promise<void>
  chatSelectChannel(channel: string): Promise<void>
  chatMarkRead(channel: string): Promise<void>
  chatPost(target: string, body: string): Promise<MegamindChatPostResult>
  members(): Promise<MegamindMembers>
  openMainframeLogin(): Promise<void>
  onChatState(callback: (state: MegamindChatState) => void): () => void
  createRequest(to: string, title: string, body: string, projectId: string): Promise<void>
  onUpdate(callback: (status: MegamindStatus) => void): () => void
  onNotification(callback: (item: MegamindRecord) => void): () => void
  onDeepLink(callback: (link: ArcaDeepLink) => void): () => void
  takeDeepLinks(): Promise<ArcaDeepLink[]>
}
