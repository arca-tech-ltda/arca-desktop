import { ipcRenderer } from 'electron'
import type {
  PiAccountProjectsApi,
  PiAccountProjectsState
} from '../../shared/pi-account-projects'

export const piAccountProjectsApi: PiAccountProjectsApi = {
  get: () => ipcRenderer.invoke('piAccountProjects:get'),
  set: (projectPath, provider, name) =>
    ipcRenderer.invoke('piAccountProjects:set', projectPath, provider, name),
  syncOpenTabs: (tabIds) => ipcRenderer.invoke('piAccountProjects:syncOpenTabs', tabIds),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PiAccountProjectsState): void =>
      callback(state)
    ipcRenderer.on('piAccountProjects:changed', listener)
    return () => ipcRenderer.removeListener('piAccountProjects:changed', listener)
  }
}
