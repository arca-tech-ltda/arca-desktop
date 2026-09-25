import { isTrustedUIRenderer } from '../ipc/ui'
import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Store } from '../persistence'
import { ArcaProjectsSync, shouldRunFocusedArcaSync, type SyncSettings } from './service'

const ARCA_PROJECTS_SYNC_INTERVAL_MS = 5 * 60_000

let service: ArcaProjectsSync | undefined

export function registerArcaProjectsSync(store: Store): void {
  if (service) {
    return
  }
  const settingsPath = path.join(app.getPath('userData'), 'arca-projects-sync.json')
  const persist = async (settings: SyncSettings): Promise<void> => {
    await writeFile(settingsPath, JSON.stringify(settings))
  }
  const instance = new ArcaProjectsSync(
    store,
    (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('arcaProjectsSync:changed', status)
        }
      }
    },
    {
      persist,
      onRepoUpdated: (repoId) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send('arcaProjectsSync:repoUpdated', repoId)
          }
        }
      }
    }
  )
  service = instance
  const ready = readFile(settingsPath, 'utf8')
    .then((text) => {
      const value: unknown = JSON.parse(text)
      instance.restoreSettings(value)
    })
    .catch(() => {})
  ipcMain.handle('arcaProjectsSync:status', async (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project sync caller')
    }
    await ready
    return instance.status()
  })
  ipcMain.handle('arcaProjectsSync:syncNow', async (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project sync caller')
    }
    await ready
    return instance.syncNow(true)
  })
  ipcMain.handle('arcaProjectsSync:setAutoUpdate', async (event, enabled: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project sync caller')
    }
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid auto-update setting')
    }
    await ready
    await persist({ ...instance.settings(), autoUpdate: enabled })
    instance.setAutoUpdate(enabled)
    return instance.status()
  })

  let lastFocusAt = 0
  const runOnFocus = (): void => {
    const now = Date.now()
    if (!shouldRunFocusedArcaSync(lastFocusAt, now)) {
      return
    }
    lastFocusAt = now
    void ready.then(() => instance.syncNow(false))
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.on('focus', runOnFocus)
  }
  app.on('browser-window-created', (_event, window) => window.on('focus', runOnFocus))
  void ready.then(() => instance.syncNow(false))
  // Partners want STATUS.md fresh for agents even when the window is in the
  // background; N is the ARCA catalog (~10 repos), so a 5-minute fetch is cheap.
  const interval = setInterval(() => {
    void ready.then(() => instance.syncNow(false))
  }, ARCA_PROJECTS_SYNC_INTERVAL_MS)
  interval.unref()
  app.once('before-quit', () => clearInterval(interval))
}
