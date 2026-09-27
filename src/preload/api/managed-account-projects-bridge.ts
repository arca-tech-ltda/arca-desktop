import { ipcRenderer } from 'electron'
import type {
  ManagedAccountProjectsApi,
  ManagedAccountProjectsState
} from '../../shared/managed-account-projects'

export const managedAccountProjectsApi: ManagedAccountProjectsApi = {
  get: () => ipcRenderer.invoke('managedAccountProjects:get'),
  set: (projectPath, agent, accountId) =>
    ipcRenderer.invoke('managedAccountProjects:set', projectPath, agent, accountId),
  syncOpenTabs: (tabIds) => ipcRenderer.invoke('managedAccountProjects:syncOpenTabs', tabIds),
  onChange: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: ManagedAccountProjectsState
    ): void => callback(state)
    ipcRenderer.on('managedAccountProjects:changed', listener)
    return () => ipcRenderer.removeListener('managedAccountProjects:changed', listener)
  }
}
