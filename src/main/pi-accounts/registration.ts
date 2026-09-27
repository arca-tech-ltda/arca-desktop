import { app, BrowserWindow, ipcMain } from 'electron'
import { ARCA_PI_IS_AUTHORITY } from '../../shared/arca-product'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import { isTrustedUIRenderer } from '../ipc/ui'
import { isValidPiAccountName } from './bucket-account-edits'
import { PiAccountsService } from './service'
import { PiAccountProjectsService, setPiAccountProjectsService } from './account-project-map'
import { refreshPiAccountSelectionSupport } from './pi-account-selection-support'

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

function registerPiAccountProjects(service: PiAccountProjectsService): void {
  ipcMain.handle('piAccountProjects:get', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    return service.getState()
  })
  ipcMain.handle(
    'piAccountProjects:set',
    async (event, projectPath: unknown, provider: unknown, name: unknown) => {
      if (!isTrustedUIRenderer(event.sender)) {
        throw new Error('Untrusted Pi accounts caller')
      }
      if (typeof projectPath !== 'string' || !projectPath.trim() || projectPath.length > 4096) {
        throw new Error('Invalid Pi account project')
      }
      const target = assertProvider(provider)
      if (name !== null && (typeof name !== 'string' || !isValidPiAccountName(name))) {
        throw new Error('Invalid Pi account name')
      }
      if (!(await refreshPiAccountSelectionSupport())) {
        return { status: 'unsupported', state: service.getState() }
      }
      if (name !== null) {
        const known = await piAccounts?.list()
        if (!known?.accounts.some((account) => account.provider === target && account.name === name)) {
          return { status: 'unknown-account', state: service.getState() }
        }
      }
      await service.setProjectAccount(projectPath, target, name)
      return { status: 'saved', state: service.getState() }
    }
  )
  ipcMain.handle('piAccountProjects:syncOpenTabs', (event, tabIds: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Pi accounts caller')
    }
    service.syncOpenTabs(Array.isArray(tabIds) ? tabIds.filter((id) => typeof id === 'string') : [])
    return service.getState()
  })
}

export function registerPiAccounts(): void {
  if (!ARCA_PI_IS_AUTHORITY) {
    return
  }
  const projects = new PiAccountProjectsService()
  setPiAccountProjectsService(projects)
  void projects.load()
  void refreshPiAccountSelectionSupport().then(() => projects.publish())
  registerPiAccountProjects(projects)
  const service = new PiAccountsService({ projects })
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
  const stopProjects = projects.onChange((state) => broadcast('piAccountProjects:changed', state))
  const stop = service.watch((state) => broadcast('piAccounts:changed', state))
  app.once('before-quit', () => {
    stopLoginUrl()
    stopProjects()
    stop()
  })
}
