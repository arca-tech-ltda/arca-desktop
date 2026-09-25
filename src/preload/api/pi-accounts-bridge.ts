import { ipcRenderer } from 'electron'
import type { PiAccountsApi, PiAccountsState } from '../../shared/pi-accounts'

export const piAccountsApi: PiAccountsApi = {
  list: () => ipcRenderer.invoke('piAccounts:list'),
  use: (provider, name) => ipcRenderer.invoke('piAccounts:use', provider, name),
  remirror: (provider) => ipcRenderer.invoke('piAccounts:remirror', provider),
  add: (provider) => ipcRenderer.invoke('piAccounts:add', provider),
  cancelAdd: () => ipcRenderer.invoke('piAccounts:cancelAdd'),
  remove: (provider, name) => ipcRenderer.invoke('piAccounts:remove', provider, name),
  rename: (provider, from, to) => ipcRenderer.invoke('piAccounts:rename', provider, from, to),
  onChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PiAccountsState): void =>
      callback(state)
    ipcRenderer.on('piAccounts:changed', listener)
    return () => ipcRenderer.removeListener('piAccounts:changed', listener)
  },
  onLoginUrl: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string | null): void => callback(url)
    ipcRenderer.on('piAccounts:loginUrl', listener)
    return () => ipcRenderer.removeListener('piAccounts:loginUrl', listener)
  }
}
