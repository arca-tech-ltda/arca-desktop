import { ipcRenderer } from 'electron'
import type { ArcaPrioritiesApi } from './arca-priorities-api'

export const arcaPrioritiesApi: ArcaPrioritiesApi = {
  list: () => ipcRenderer.invoke('arca-priorities:list'),
  onChange: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('arca-priorities:changed', listener)
    return () => ipcRenderer.removeListener('arca-priorities:changed', listener)
  }
}
