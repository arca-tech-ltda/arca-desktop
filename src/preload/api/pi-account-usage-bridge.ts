import { ipcRenderer } from 'electron'
import type { PiAccountUsageApi, PiAccountUsageState } from '../../shared/pi-account-usage'

export const piAccountUsageApi: PiAccountUsageApi = {
  list: () => ipcRenderer.invoke('piAccountUsage:list'),
  setWatching: (watching) => ipcRenderer.invoke('piAccountUsage:setWatching', watching),
  history: (provider, name) => ipcRenderer.invoke('piAccountUsage:history', provider, name),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PiAccountUsageState): void =>
      callback(state)
    ipcRenderer.on('piAccountUsage:changed', listener)
    return () => ipcRenderer.removeListener('piAccountUsage:changed', listener)
  }
}
