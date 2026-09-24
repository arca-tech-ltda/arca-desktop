import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const statusMdTasksApi = {
  list: () => ipcRenderer.invoke('status-md-tasks:list'),
  recent: () => ipcRenderer.invoke('status-md-tasks:recent'),
  onChanged: (callback: (payload: { repoId: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { repoId: string }) =>
      callback(payload)
    ipcRenderer.on('status-md-tasks:changed', listener)
    return () => ipcRenderer.removeListener('status-md-tasks:changed', listener)
  }
} satisfies PreloadApi['statusMdTasks']
