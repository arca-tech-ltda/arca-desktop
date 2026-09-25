import { app, BrowserWindow, ipcMain } from 'electron'
import { ARCA_PI_IS_AUTHORITY } from '../../shared/arca-product'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import { isTrustedUIRenderer } from '../ipc/ui'
import { isValidPiAccountName } from './bucket-account-edits'
import { PiAccountsService } from './service'

function assertProvider(provider: unknown): PiAccountProvider {
  if (provider !== 'anthropic' && provider !== 'openai-codex') {
    throw new Error('Invalid Pi account selection')
  }
  return provider
}

function assertName(name: unknown): string {
  if (typeof name !== 'string' || !name || name.length > 256) {
    throw new Error('Invalid Pi account selection')
  }
  return name
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && isTrustedUIRenderer(window.webContents)) {
      window.webContents.send(channel, payload)
    }
  }
}

let piAccounts: PiAccountsService | null = null

export function getPiAccountsService(): PiAccountsService | null {
  return piAccounts
}

export function registerPiAccounts(): void {
  if (!ARCA_PI_IS_AUTHORITY) {
    return
  }
  const service = new PiAccountsService()
  piAccounts = service
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
    return service.use(assertProvider(provider), assertName(name))
  })
  ipcMain.handle('piAccounts:remirror', (event, provider: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.remirror(assertProvider(provider))
  })
  ipcMain.handle('piAccounts:add', (event, provider: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.add(assertProvider(provider))
  })
  ipcMain.handle('piAccounts:cancelAdd', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.abandonPendingLogin()
  })
  ipcMain.handle('piAccounts:remove', (event, provider: unknown, name: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.remove(assertProvider(provider), assertName(name))
  })
  ipcMain.handle('piAccounts:rename', (event, provider: unknown, from: unknown, to: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    const target = assertName(to)
    if (!isValidPiAccountName(target)) {
      throw new Error('Invalid Pi account name')
    }
    return service.rename(assertProvider(provider), assertName(from), target)
  })
  const stopLoginUrl = service.onLoginUrlChanged((url) => broadcast('piAccounts:loginUrl', url))
  const stop = service.watch((state) => broadcast('piAccounts:changed', state))
  app.once('before-quit', () => {
    stopLoginUrl()
    stop()
  })
}
