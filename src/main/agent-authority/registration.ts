import { app, BrowserWindow, ipcMain } from 'electron'
import { isTrustedUIRenderer } from '../ipc/ui'
import {
  getAgentAuthorityState,
  onAgentAuthorityChanged,
  refreshAgentAuthority,
  startAgentAuthority,
  type AgentAuthoritySettingsSource
} from './agent-authority-state'

export function registerAgentAuthority(source: AgentAuthoritySettingsSource): void {
  const stopAuthority = startAgentAuthority(source)
  ipcMain.handle('agentAuthority:get', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted agent authority caller')
    }
    return getAgentAuthorityState()
  })
  ipcMain.handle('agentAuthority:refresh', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted agent authority caller')
    }
    return refreshAgentAuthority()
  })
  const stopBroadcast = onAgentAuthorityChanged((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && isTrustedUIRenderer(window.webContents)) {
        window.webContents.send('agentAuthority:changed', state)
      }
    }
  })
  app.once('before-quit', () => {
    stopBroadcast()
    stopAuthority()
  })
}
