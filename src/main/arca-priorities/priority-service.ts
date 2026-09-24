import { app, ipcMain, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Store } from '../persistence'
import {
  parseArcaPriority,
  sortArcaPriorities,
  type ArcaPriorityProject
} from '../../shared/arca-priorities'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { isArcaProjectExcludedByDefault } from '../../shared/arca-product'
import { object } from '../arca-megamind/credentials'
import { listMegamindPriorities, onMegamindPrioritiesChanged } from '../arca-megamind/priorities'
import { electronRuntimeDesktopSurface } from '../host/electron-runtime-desktop-surface'
import { readProjectTimeSnapshot } from '../stats/project-time-store'
import {
  applyLocalHours,
  excludeDefaultPriorityProjects,
  mergePriorityProjects,
  priorityNotifications,
  repoKey
} from './priority-data'

const REFRESH_MS = 5 * 60_000
const STATUS_FILE = 'STATUS.md'

type StoredDedupe = { seen: string[] }

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sharedProject(value: unknown): ArcaPriorityProject | null {
  if (!object(value)) {
    return null
  }
  const projectId = stringValue(value.project_id)
  const name = stringValue(value.name)
  if (!projectId || !name) {
    return null
  }
  if (
    isArcaProjectExcludedByDefault({
      name,
      repoKey: stringValue(value.repo_key) ?? undefined,
      archived: value.archived === true || value.isArchived === true,
      legacy: value.legacy === true || value.legado === true
    })
  ) {
    return null
  }
  const total = numberValue(value.total) ?? 0
  const done = numberValue(value.done) ?? 0
  const blocked = Array.isArray(value.blocked)
    ? value.blocked.filter(object).flatMap((item) => {
        const text = stringValue(item.text)
        const line = numberValue(item.line)
        return text && line !== null
          ? [{ text, blockedBy: stringValue(item.blockedBy) ?? '', line }]
          : []
      })
    : []
  const queue = Array.isArray(value.queue)
    ? value.queue.filter(object).flatMap((item) => {
        const title = stringValue(item.title)
        return title
          ? [
              {
                title,
                percent: numberValue(item.percent),
                done: numberValue(item.done) ?? 0,
                total: numberValue(item.total) ?? 0
              }
            ]
          : []
      })
    : []
  return {
    projectId,
    repoId: null,
    repoKey: stringValue(value.repo_key)?.toLowerCase() ?? null,
    name,
    path: null,
    statusPath: null,
    source: 'shared',
    title: stringValue(value.title),
    percent: numberValue(value.percent),
    done,
    total,
    blocked,
    queue,
    line: numberValue(value.line),
    updatedAt: stringValue(value.updated_at),
    completed: total > 0 && done === total,
    hours7d: numberValue(value.hours_7d_total),
    hoursLabel: numberValue(value.hours_7d_total) === null ? null : 'team',
    startedAt: stringValue(value.started_at),
    recentEvents: Array.isArray(value.recent_events) ? value.recent_events : [],
    openTasks: []
  }
}

function sharedProjects(result: MegamindRecord): ArcaPriorityProject[] {
  return Array.isArray(result.projects)
    ? result.projects
        .map(sharedProject)
        .filter((item): item is ArcaPriorityProject => item !== null)
    : []
}

async function localProjects(store: Store): Promise<ArcaPriorityProject[]> {
  return Promise.all(
    store.getRepos().map(async (repo) => {
      const remote =
        Boolean(repo.connectionId) ||
        Boolean(repo.executionHostId && repo.executionHostId !== 'local')
      let parsed = parseArcaPriority(null)
      if (!remote) {
        try {
          parsed = parseArcaPriority(await readFile(join(repo.path, STATUS_FILE), 'utf8'))
        } catch {
          // Missing STATUS.md is represented by an empty local priority.
        }
      }
      return {
        ...parsed,
        projectId: repo.id,
        repoId: repo.id,
        repoKey: repoKey(repo),
        name: repo.displayName,
        path: repo.path,
        statusPath: join(repo.path, STATUS_FILE),
        source: 'local' as const,
        hours7d: null,
        hoursLabel: null,
        startedAt: null,
        recentEvents: []
      }
    })
  )
}

class PriorityService {
  private projects: ArcaPriorityProject[] = []
  private initialized = false
  private busy: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval>
  private stopMegamind: () => void
  private seen = new Set<string>()
  private dedupePath = join(app.getPath('userData'), 'priority-notifications.json')

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly store: Store
  ) {
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
    this.timer.unref()
    this.stopMegamind = onMegamindPrioritiesChanged(() => void this.refresh())
    void this.loadSeen().then(() => this.refresh())
  }

  list(): Promise<ArcaPriorityProject[]> {
    return this.refresh().then(() => this.projects)
  }

  refresh(): Promise<void> {
    this.busy ??= this.doRefresh().finally(() => {
      this.busy = null
    })
    return this.busy
  }

  private async doRefresh(): Promise<void> {
    const local = await localProjects(this.store)
    let projects = local
    try {
      projects = mergePriorityProjects(local, sharedProjects(await listMegamindPriorities()))
    } catch {
      // Local STATUS.md remains authoritative when the optional tool is unavailable.
    }
    projects = applyLocalHours(
      excludeDefaultPriorityProjects(projects),
      readProjectTimeSnapshot(join(app.getPath('userData'), 'project-time.json'))
    )
    const sorted = sortArcaPriorities(projects)
    if (this.initialized) {
      const notifications = priorityNotifications(this.projects, sorted, this.seen)
      for (const notification of notifications) {
        electronRuntimeDesktopSurface.showNotification(notification)
        this.seen.add(notification.key)
      }
      if (notifications.length > 0) {
        await this.saveSeen()
      }
    } else {
      for (const project of sorted) {
        for (const block of project.blocked) {
          this.seen.add(`blocked:${project.repoKey ?? project.projectId}:${block.text}`)
        }
      }
      this.initialized = true
      await this.saveSeen()
    }
    this.projects = sorted
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('arca-priorities:changed')
    }
  }

  private async loadSeen(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(this.dedupePath, 'utf8'))
      if (object(value) && Array.isArray(value.seen)) {
        this.seen = new Set(value.seen.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      // New profiles have no notification ledger.
    }
  }

  private saveSeen(): Promise<void> {
    const payload: StoredDedupe = { seen: [...this.seen].slice(-2000) }
    return writeFile(this.dedupePath, JSON.stringify(payload), { mode: 0o600 })
  }

  stop(): void {
    clearInterval(this.timer)
    this.stopMegamind()
  }
}

let service: PriorityService | null = null

export function registerArcaPriorityHandlers(mainWindow: BrowserWindow, store: Store): () => void {
  service?.stop()
  service = new PriorityService(mainWindow, store)
  ipcMain.removeHandler('arca-priorities:list')
  ipcMain.handle('arca-priorities:list', () => service?.list() ?? [])
  return () => void service?.refresh()
}
