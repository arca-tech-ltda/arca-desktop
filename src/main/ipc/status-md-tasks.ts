import { ipcMain, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import { parseStatusMd } from '../../shared/status-md-tasks'
import type {
  StatusMdRecentTask,
  StatusMdRecentTasks,
  StatusMdTaskProject
} from '../../preload/api/status-md-tasks-api'
import type { Store } from '../persistence'
import { registerArcaPriorityHandlers } from '../arca-priorities/priority-service'
import { statusMdTaskTimestamps } from '../git/status-md-task-recency'

const STATUS_FILE = 'STATUS.md'

type ReadText = (path: string) => Promise<string>

export async function readStatusMdTasksForRepos(
  repos: readonly Repo[],
  readText: ReadText = async (path) => readFile(path, 'utf8')
): Promise<StatusMdTaskProject[]> {
  return Promise.all(
    repos.map(async (repo): Promise<StatusMdTaskProject> => {
      const remote =
        Boolean(repo.connectionId) ||
        Boolean(repo.executionHostId && repo.executionHostId !== 'local')
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

type ReadTaskTimestamps = (
  repoPath: string,
  statusPath: string,
  tasks: StatusMdTaskProject['tasks']
) => Promise<Map<number, number>>

export async function recentStatusMdTasks(
  projects: readonly StatusMdTaskProject[],
  readTimestamps: ReadTaskTimestamps = statusMdTaskTimestamps
): Promise<StatusMdRecentTasks> {
  const recent = (
    await Promise.all(
      projects
        .filter((project) => project.status === 'available')
        .map(async (project): Promise<StatusMdRecentTask[]> => {
          try {
            const timestamps = await readTimestamps(project.path, project.statusPath, project.tasks)
            return project.tasks.map((task) => ({
              repoId: project.repoId,
              projectName: project.name,
              path: project.path,
              statusPath: project.statusPath,
              task,
              changedAt: timestamps.get(task.lineNumber) ?? 0
            }))
          } catch {
            return []
          }
        })
    )
  )
    .flat()
    .sort(
      (left, right) =>
        right.changedAt - left.changedAt ||
        left.projectName.localeCompare(right.projectName) ||
        left.task.lineNumber - right.task.lineNumber
    )

  return {
    open: recent.filter((item) => !item.task.completed).slice(0, 8),
    completed: recent.filter((item) => item.task.completed).slice(0, 3)
  }
}

export function registerStatusMdTaskHandlers(mainWindow: BrowserWindow, store: Store): void {
  const refreshPriorities = registerArcaPriorityHandlers(mainWindow, store)
  syncStatusWatchers(mainWindow, store.getRepos(), refreshPriorities)
  const retry = setInterval(() => {
    syncStatusWatchers(mainWindow, store.getRepos(), refreshPriorities)
  }, 2_000)
  retry.unref()
  mainWindow.once('closed', () => {
    clearInterval(retry)
    syncStatusWatchers(mainWindow, [], refreshPriorities)
  })
  ipcMain.removeHandler('status-md-tasks:list')
  ipcMain.handle('status-md-tasks:list', async (): Promise<StatusMdTaskProject[]> => {
    const repos = store.getRepos()
    syncStatusWatchers(mainWindow, repos, refreshPriorities)
    return readStatusMdTasksForRepos(repos)
  })
  ipcMain.removeHandler('status-md-tasks:recent')
  ipcMain.handle('status-md-tasks:recent', async (): Promise<StatusMdRecentTasks> => {
    const repos = store.getRepos()
    syncStatusWatchers(mainWindow, repos, refreshPriorities)
    return recentStatusMdTasks(await readStatusMdTasksForRepos(repos))
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
      watcher.on('error', () => {
        const current = watchers.get(repo.id)
        if (current?.watcher !== watcher) {
          return
        }
        if (current.timer) {
          clearTimeout(current.timer)
        }
        watchers.delete(repo.id)
        watcher.close()
      })
      watchers.set(repo.id, { watcher, timer: null })
    } catch {
      // The list call still reports the file state; watching can start after the path appears.
    }
  }
}
