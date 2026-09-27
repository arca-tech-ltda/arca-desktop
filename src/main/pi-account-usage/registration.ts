import { app, BrowserWindow, ipcMain } from 'electron'
import { ARCA_PI_IS_AUTHORITY } from '../../shared/arca-product'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import { isTrustedUIRenderer } from '../ipc/ui'
import { PiAccountUsageService } from './service'

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

function assertTrusted(sender: Electron.WebContents): void {
  if (!isTrustedUIRenderer(sender)) {
    throw new Error('Untrusted Pi account usage caller')
  }
}

export function registerPiAccountUsage(): void {
  if (!ARCA_PI_IS_AUTHORITY) {
    return
  }
  const service = new PiAccountUsageService()
  // Why: a renderer that reloads or closes never sends its `watch(false)`; without this the
  // poll would keep running against the provider APIs with no screen open.
  const watching = new Set<number>()
  const release = (id: number): void => {
    if (watching.delete(id)) {
      service.releaseWatcher()
    }
  }
  ipcMain.handle('piAccountUsage:list', (event) => {
    assertTrusted(event.sender)
    return service.list()
  })
  ipcMain.handle('piAccountUsage:setWatching', (event, next: unknown) => {
    assertTrusted(event.sender)
    const id = event.sender.id
    if (next === true) {
      if (!watching.has(id)) {
        watching.add(id)
        event.sender.once('destroyed', () => release(id))
        return service.setWatching(true)
      }
      return service.list()
    }
    release(id)
    return service.setWatching(false)
  })
  ipcMain.handle('piAccountUsage:history', (event, provider: unknown, name: unknown) => {
    assertTrusted(event.sender)
    return service.getHistory(assertProvider(provider), assertName(name))
  })
  const stop = service.onChange((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && isTrustedUIRenderer(window.webContents)) {
        window.webContents.send('piAccountUsage:changed', state)
      }
    }
  })
  app.once('before-quit', () => {
    stop()
    service.dispose()
  })
}
