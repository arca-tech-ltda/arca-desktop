import { ipcRenderer } from 'electron'
import type { PiAccountsApi, PiAccountsState } from '../../shared/pi-accounts'

export const piAccountsApi: PiAccountsApi = {
  list: () => ipcRenderer.invoke('piAccounts:list'),
  use: (provider, name) => ipcRenderer.invoke('piAccounts:use', provider, name),
  remirror: (provider) => ipcRenderer.invoke('piAccounts:remirror', provider),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PiAccountsState): void =>
      callback(state)
    ipcRenderer.on('piAccounts:changed', listener)
    return () => ipcRenderer.removeListener('piAccounts:changed', listener)
  }
}
