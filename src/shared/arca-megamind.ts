import type { ArcaDeepLink } from './arca-deep-link'

export type MegamindRecord = Record<string, unknown>
export type MegamindStatus = {
  state: 'disconnected' | 'pending' | 'connected' | 'expired' | 'error'
  device?: string
  userCode?: string
  verificationUri?: string
}
export type MegamindApproval = { id: string; summary: string; relevant?: boolean }
export type MegamindPrerequisites = {
  pi: boolean
  installer: boolean
  extension: boolean
  windows: boolean
}
export type ArcaMegamindApi = {
  prerequisites(): Promise<MegamindPrerequisites>
  status(): Promise<MegamindStatus>
  startEnrollment(): Promise<MegamindStatus>
  agents(): Promise<MegamindRecord[]>
  requests(): Promise<MegamindRecord[]>
  approvals(): Promise<MegamindApproval[]>
  decide(id: string, decision: 'approved' | 'denied'): Promise<'ok' | 'login'>
  createRequest(to: string, title: string, body: string, projectId: string): Promise<void>
  onUpdate(callback: (status: MegamindStatus) => void): () => void
  onNotification(callback: (item: MegamindRecord) => void): () => void
  onDeepLink(callback: (link: ArcaDeepLink) => void): () => void
  takeDeepLinks(): Promise<ArcaDeepLink[]>
}
