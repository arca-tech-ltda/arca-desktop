import { ipcRenderer } from 'electron'
import type { AgentAuthorityApi, AgentAuthorityState } from '../../shared/agent-authority'

export const agentAuthorityApi: AgentAuthorityApi = {
  get: () => ipcRenderer.invoke('agentAuthority:get'),
  refresh: () => ipcRenderer.invoke('agentAuthority:refresh'),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AgentAuthorityState): void =>
      callback(state)
    ipcRenderer.on('agentAuthority:changed', listener)
    return () => ipcRenderer.removeListener('agentAuthority:changed', listener)
  }
}
