import { ipcRenderer } from 'electron'
import type { ArcaProjectsSyncApi, ArcaSyncStatus } from '../../shared/arca-projects-sync'

export const arcaProjectsSyncApi: ArcaProjectsSyncApi = {
  status: () => ipcRenderer.invoke('arcaProjectsSync:status'),
  syncNow: () => ipcRenderer.invoke('arcaProjectsSync:syncNow'),
  setAutoUpdate: (enabled) => ipcRenderer.invoke('arcaProjectsSync:setAutoUpdate', enabled),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ArcaSyncStatus): void =>
      callback(status)
    ipcRenderer.on('arcaProjectsSync:changed', listener)
    return () => {
      ipcRenderer.removeListener('arcaProjectsSync:changed', listener)
    }
  }
}
