import { ipcRenderer } from 'electron'
import type { ArcaMegamindApi, MegamindStatus, MegamindRecord } from '../../shared/arca-megamind'
import type { ArcaDeepLink } from '../../shared/arca-deep-link'
import type { MegamindChatState } from '../../shared/arca-megamind-chat'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
export const arcaMegamindApi: ArcaMegamindApi = {
  prerequisites: () => ipcRenderer.invoke('arcaMegamind:prerequisites'),
  status: () => ipcRenderer.invoke('arcaMegamind:status'),
  startEnrollment: () => ipcRenderer.invoke('arcaMegamind:startEnrollment'),
  agents: () => ipcRenderer.invoke('arcaMegamind:agents'),
  requests: () => ipcRenderer.invoke('arcaMegamind:requests'),
  approvals: () => ipcRenderer.invoke('arcaMegamind:approvals'),
  decide: (id, decision) => ipcRenderer.invoke('arcaMegamind:decide', id, decision),
  chatState: () => ipcRenderer.invoke('arcaMegamind:chatState'),
  chatSetVisible: (visible) => ipcRenderer.invoke('arcaMegamind:chatSetVisible', visible),
  chatSelectChannel: (channel) => ipcRenderer.invoke('arcaMegamind:chatSelectChannel', channel),
  chatMarkRead: (channel) => ipcRenderer.invoke('arcaMegamind:chatMarkRead', channel),
  chatPost: (target, body) => ipcRenderer.invoke('arcaMegamind:chatPost', target, body),
  members: () => ipcRenderer.invoke('arcaMegamind:members'),
  openMainframeLogin: () => ipcRenderer.invoke('arcaMegamind:openMainframeLogin'),
  onChatState: (callback) => subscribe<MegamindChatState>('arcaMegamind:chatState', callback),
  createRequest: (to, title, body, projectId) =>
    ipcRenderer.invoke('arcaMegamind:createRequest', to, title, body, projectId),
  onUpdate: (callback) => subscribe<MegamindStatus>('arcaMegamind:update', callback),
  onNotification: (callback) => {
    const off = subscribe<MegamindRecord>('arcaMegamind:notification', callback)
    ipcRenderer.send('arcaMegamind:subscribe')
    return () => {
      off()
      ipcRenderer.send('arcaMegamind:unsubscribe')
    }
  },
  onDeepLink: (callback) => subscribe<ArcaDeepLink>('arcaMegamind:deepLink', callback),
  takeDeepLinks: () => ipcRenderer.invoke('arcaMegamind:takeDeepLinks')
}
