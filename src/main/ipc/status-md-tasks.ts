import { ipcMain, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import { parseStatusMd } from '../../shared/status-md-tasks'
import type { StatusMdTaskProject } from '../../preload/api/status-md-tasks-api'
import type { Store } from '../persistence'
import { registerArcaPriorityHandlers } from '../arca-priorities/priority-service'

const STATUS_FILE = 'STATUS.md'

type ReadText = (path: string) => Promise<string>

export async function readStatusMdTasksForRepos(
  repos: readonly Repo[],
  readText: ReadText = async (path) => readFile(path, 'utf8')
): Promise<StatusMdTaskProject[]> {
  return Promise.all(
    repos.map(async (repo): Promise<StatusMdTaskProject> => {
      const remote = Boolean(repo.connectionId) || Boolean(repo.executionHostId && repo.executionHostId !== 'local')
      if (remote) {
        return {
          repoId: repo.id,
          name: repo.displayName,
          path: repo.path,
          statusPath: join(repo.path, STATUS_FILE),
          status: 'unavailable',
          tasks: [],
          updatedAt: null
        }
      }

      try {
        const parsed = parseStatusMd(await readText(join(repo.path, STATUS_FILE)), repo.id)
        return {
          repoId: repo.id,
          name: repo.displayName,
          path: repo.path,
          statusPath: join(repo.path, STATUS_FILE),
          status: 'available',
          tasks: parsed.tasks,
          updatedAt: parsed.updatedAt
        }
      } catch (error: unknown) {
        if (isMissingFile(error)) {
          return {
            repoId: repo.id,
            name: repo.displayName,
            path: repo.path,
            statusPath: join(repo.path, STATUS_FILE),
            status: 'missing',
            tasks: [],
            updatedAt: null
          }
        }
        return {
          repoId: repo.id,
          name: repo.displayName,
          path: repo.path,
          statusPath: join(repo.path, STATUS_FILE),
          status: 'unavailable',
          tasks: [],
          updatedAt: null
        }
      }
    })
  )
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function registerStatusMdTaskHandlers(mainWindow: BrowserWindow, store: Store): void {
  const refreshPriorities = registerArcaPriorityHandlers(mainWindow, store)
  syncStatusWatchers(mainWindow, store.getRepos(), refreshPriorities)
  ipcMain.removeHandler('status-md-tasks:list')
  ipcMain.handle('status-md-tasks:list', async (): Promise<StatusMdTaskProject[]> => {
    const repos = store.getRepos()
    syncStatusWatchers(mainWindow, repos, refreshPriorities)
    return readStatusMdTasksForRepos(repos)
  })
}

const watchers = new Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null }>()

function syncStatusWatchers(
  mainWindow: BrowserWindow,
  repos: readonly Repo[],
  refreshPriorities: () => void
): void {
  const localRepos = repos.filter(
    (repo) => !repo.connectionId && (!repo.executionHostId || repo.executionHostId === 'local')
  )
  const wanted = new Set(localRepos.map((repo) => repo.id))
  for (const [repoId, current] of watchers) {
    if (!wanted.has(repoId)) {
      if (current.timer) {
        clearTimeout(current.timer)
      }
      current.watcher.close()
      watchers.delete(repoId)
    }
  }

  for (const repo of localRepos) {
    if (watchers.has(repo.id)) {
      continue
    }
    try {
      const watcher = watch(repo.path, { persistent: false }, (_event, filename) => {
        if (filename && filename.toString() !== STATUS_FILE) {
          return
        }
        const current = watchers.get(repo.id)
        if (!current) {
          return
        }
        if (current.timer) {
          clearTimeout(current.timer)
        }
        current.timer = setTimeout(() => {
          current.timer = null
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('status-md-tasks:changed', { repoId: repo.id })
            refreshPriorities()
          }
        }, 120)
      })
      watchers.set(repo.id, { watcher, timer: null })
    } catch {
      // The list call still reports the file state; watching can start after the path appears.
    }
  }
}
