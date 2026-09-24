import { app, BrowserWindow, ipcMain } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { Store } from '../persistence'
import { addLocalRepoFromPath } from '../ipc/repos/local-repo-registration'
import { notifyReposChanged } from '../ipc/repos/repos-changed-notification'
import { invalidateAuthorizedRootsCache } from '../ipc/registered-worktree-roots-cache'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { emptyArcaSyncStatus, type ArcaSyncStatus } from '../../shared/arca-projects-sync'
import { loadArcaCatalog } from './catalog'
import { scanArcaDisk } from './disk'
import { syncArcaGit } from './git-sync'

export class ArcaProjectsSync {
  private current: ArcaSyncStatus = { ...emptyArcaSyncStatus }
  private pending?: Promise<ArcaSyncStatus>
  constructor(
    private store: Store,
    private changed: (status: ArcaSyncStatus) => void
  ) {}
  status(): ArcaSyncStatus {
    return this.current
  }
  setAutoUpdate(autoUpdate: boolean): void {
    this.current = { ...this.current, autoUpdate }
    this.changed(this.current)
  }
  syncNow(): Promise<ArcaSyncStatus> {
    this.pending ??= this.run().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }
  private async run(): Promise<ArcaSyncStatus> {
    this.current = { ...this.current, running: true }
    this.changed(this.current)
    try {
      const catalog = await loadArcaCatalog()
      if (!catalog.sources.length) {
        throw new Error(catalog.errors.join('\n'))
      }
      const disk = await scanArcaDisk(homedir())
      const projects: ArcaSyncStatus['projects'] = []
      for (const entry of catalog.entries) {
        const found =
          disk.find(
            (repo) =>
              repo.repoKey === entry.repoKey &&
              normalizeRuntimePathForComparison(repo.path) ===
                normalizeRuntimePathForComparison(entry.destination)
          ) ?? disk.find((repo) => repo.repoKey === entry.repoKey)
        if (!found) {
          projects.push({ ...entry, state: 'missing' })
          continue
        }
        const row: ArcaSyncStatus['projects'][number] = {
          ...entry,
          diskPath: found.path,
          state: 'error'
        }
        try {
          const registration = await addLocalRepoFromPath(this.store, found.path)
          if ('error' in registration) {
            throw new Error(registration.error)
          }
          row.repoId = registration.repo.id
          if (!registration.alreadyExisted) {
            invalidateAuthorizedRootsCache()
            const window = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
            if (window) {
              notifyReposChanged(window)
            }
          }
          Object.assign(row, await syncArcaGit(found.path, () => this.current.autoUpdate))
        } catch (error) {
          row.error = String(error)
        }
        projects.push(row)
      }
      this.current = {
        ...this.current,
        projects,
        sources: catalog.sources,
        errors: catalog.errors,
        outside: disk.filter(
          (repo) => !catalog.entries.some((entry) => entry.repoKey === repo.repoKey)
        ),
        lastSync: new Date().toISOString()
      }
    } catch (error) {
      this.current = { ...this.current, errors: [String(error)] }
    } finally {
      this.current = { ...this.current, running: false }
      this.changed(this.current)
    }
    return this.current
  }
}

let service: ArcaProjectsSync | undefined
export function registerArcaProjectsSync(store: Store): void {
  if (service) {
    return
  }
  const instance = new ArcaProjectsSync(store, (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('arcaProjectsSync:changed', status)
      }
    }
  })
  service = instance
  const settingsPath = path.join(app.getPath('userData'), 'arca-projects-sync.json')
  const ready = readFile(settingsPath, 'utf8')
    .then((text) => {
      const value: unknown = JSON.parse(text)
      if (
        typeof value === 'object' &&
        value !== null &&
        'autoUpdate' in value &&
        typeof value.autoUpdate === 'boolean'
      ) {
        instance.setAutoUpdate(value.autoUpdate)
      }
    })
    .catch(() => {})
  ipcMain.handle('arcaProjectsSync:status', async () => {
    await ready
    return instance.status()
  })
  ipcMain.handle('arcaProjectsSync:syncNow', async () => {
    await ready
    return instance.syncNow()
  })
  ipcMain.handle('arcaProjectsSync:setAutoUpdate', async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid auto-update setting')
    }
    await ready
    await writeFile(settingsPath, JSON.stringify({ autoUpdate: enabled }))
    instance.setAutoUpdate(enabled)
    return instance.status()
  })
  const first = setTimeout(() => {
    void ready.then(() => instance.syncNow())
  }, 20_000)
  const interval = setInterval(() => {
    void ready.then(() => instance.syncNow())
  }, 30 * 60_000)
  first.unref()
  interval.unref()
  app.once('before-quit', () => {
    clearTimeout(first)
    clearInterval(interval)
  })
}
