import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import { isTrustedUIRenderer } from './ui'
import { ipcMain, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { readStatusMdContent } from '../git/status-md-content'
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
  readText: ReadText = readStatusMdContent
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
    await mapWithConcurrency(
      projects.filter((project) => project.status === 'available'),
      4,
      async (project): Promise<StatusMdRecentTask[]> => {
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
      }
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

type WatchState = {
  watchers: Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null; path: string }>
  failures: Map<string, { delay: number; retryAt: number }>
}
const registrations = new Map<
  number,
  {
    list: () => Promise<StatusMdTaskProject[]>
    recent: () => Promise<StatusMdRecentTasks>
  }
>()

export function registerStatusMdTaskHandlers(mainWindow: BrowserWindow, store: Store): void {
  const refreshPriorities = registerArcaPriorityHandlers(mainWindow, store)
  const state: WatchState = { watchers: new Map(), failures: new Map() }
  const sync = (): void =>
    syncStatusWatchers(state, mainWindow, store.getRepos(), refreshPriorities)
  sync()
  const retry = setInterval(sync, 2_000)
  retry.unref()
  let reading: Promise<StatusMdTaskProject[]> | null = null
  let scanning: Promise<StatusMdRecentTasks> | null = null
  const list = (): Promise<StatusMdTaskProject[]> => {
    sync()
    reading ??= readStatusMdTasksForRepos(store.getRepos()).finally(() => {
      reading = null
    })
    return reading
  }
  const id = mainWindow.webContents.id
  const registration = {
    list,
    recent: (): Promise<StatusMdRecentTasks> => {
      scanning ??= list()
        .then((projects) => recentStatusMdTasks(projects))
        .finally(() => {
          scanning = null
        })
      return scanning
    }
  }
  registrations.set(id, registration)
  mainWindow.once('closed', () => {
    clearInterval(retry)
    syncStatusWatchers(state, mainWindow, [], refreshPriorities)
    if (registrations.get(id) === registration) {
      registrations.delete(id)
    }
  })
  for (const method of ['list', 'recent'] as const) {
    ipcMain.removeHandler(`status-md-tasks:${method}`)
    ipcMain.handle(`status-md-tasks:${method}`, (event) => {
      if (!isTrustedUIRenderer(event.sender)) {
        throw new Error('Untrusted STATUS.md caller')
      }
      const registered = registrations.get(event.sender.id)
      if (!registered) {
        throw new Error('STATUS.md window is closed')
      }
      return registered[method]()
    })
  }
}

function syncStatusWatchers(
  state: WatchState,
  mainWindow: BrowserWindow,
  repos: readonly Repo[],
  refreshPriorities: () => void
): void {
  const { watchers, failures } = state
  const failed = (id: string): void => {
    const delay = Math.min((failures.get(id)?.delay ?? 1_000) * 2, 30_000)
    failures.set(id, { delay, retryAt: Date.now() + delay })
  }
  const localRepos = repos.filter(
    (repo) => !repo.connectionId && (!repo.executionHostId || repo.executionHostId === 'local')
  )
  const wanted = new Set(localRepos.map((repo) => repo.id))
  for (const id of failures.keys()) {
    if (!wanted.has(id)) {
      failures.delete(id)
    }
  }
  for (const [repoId, current] of watchers) {
    if (!localRepos.some((repo) => repo.id === repoId && repo.path === current.path)) {
      if (current.timer) {
        clearTimeout(current.timer)
      }
      current.watcher.close()
      watchers.delete(repoId)
    }
  }

  for (const repo of localRepos) {
    if (watchers.has(repo.id) || (failures.get(repo.id)?.retryAt ?? 0) > Date.now()) {
      continue
    }
    try {
      const watcher = watch(repo.path, { persistent: false }, (_event, filename) => {
        if (filename && filename.toString().toLowerCase() !== STATUS_FILE.toLowerCase()) {
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
        }, 1_500)
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
        failed(repo.id)
      })
      watchers.set(repo.id, { watcher, timer: null, path: repo.path })
    } catch {
      failed(repo.id)
    }
  }
}
