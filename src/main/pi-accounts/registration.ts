import { app, BrowserWindow, ipcMain } from 'electron'
import { ARCA_PI_IS_AUTHORITY } from '../../shared/arca-product'
import { isTrustedUIRenderer } from '../ipc/ui'
import { PiAccountsService } from './service'

export function registerPiAccounts(): void {
  if (!ARCA_PI_IS_AUTHORITY) {
    return
  }
  const service = new PiAccountsService()
  ipcMain.handle('piAccounts:list', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.list()
  })
  ipcMain.handle('piAccounts:use', (event, provider: unknown, name: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    if (
      (provider !== 'anthropic' && provider !== 'openai-codex') ||
      typeof name !== 'string' ||
      !name ||
      name.length > 256
    ) {
      throw new Error('Invalid Pi account selection')
    }
    return service.use(provider, name)
  })
  const stop = service.watch((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && isTrustedUIRenderer(window.webContents)) {
        window.webContents.send('piAccounts:changed', state)
      }
    }
  })
  app.once('before-quit', stop)
}
