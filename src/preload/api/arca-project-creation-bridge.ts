import { ipcRenderer } from 'electron'
import type {
  ArcaProjectCreationApi,
  ArcaProjectCreationProgress
} from '../../shared/arca-project-creation'

export const arcaProjectCreationApi: ArcaProjectCreationApi = {
  create: (request) => ipcRenderer.invoke('arcaProjectCreate:run', request),
  publishEligibility: (path) => ipcRenderer.invoke('arcaProjectCreate:publishEligibility', path),
  onProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: ArcaProjectCreationProgress
    ): void => callback(progress)
    ipcRenderer.on('arcaProjectCreate:progress', listener)
    return () => {
      ipcRenderer.removeListener('arcaProjectCreate:progress', listener)
    }
  }
}
