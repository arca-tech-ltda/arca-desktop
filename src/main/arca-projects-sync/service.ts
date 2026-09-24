import { BrowserWindow, Notification } from 'electron'
import { homedir } from 'node:os'
import type { Store } from '../persistence'
import { addLocalRepoFromPath } from '../ipc/repos/local-repo-registration'
import { notifyReposChanged } from '../ipc/repos/repos-changed-notification'
import { invalidateAuthorizedRootsCache } from '../ipc/registered-worktree-roots-cache'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { isArcaProjectExcludedByDefault } from '../../shared/arca-product'
import {
  emptyArcaSyncStatus,
  type ArcaCatalogEntry,
  type ArcaSyncRow,
  type ArcaSyncStatus
} from '../../shared/arca-projects-sync'
import { loadArcaCatalog } from './catalog'
import { scanArcaDisk, hasArcaDiskSpace } from './disk'
import { syncArcaGit } from './git-sync'
import { cloneArcaProject, inspectArcaCloneDestination, isCloneAccessError } from './clone'

const ACCESS_BACKOFF_MS = 24 * 60 * 60_000
const FOCUS_THROTTLE_MS = 2 * 60_000
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024

export type SyncSettings = {
  autoUpdate?: boolean
  inaccessibleUntil?: Record<string, number>
}

type ArcaProjectsSyncOptions = {
  onRepoUpdated?: (repoId: string) => void
  persist?: (settings: SyncSettings) => Promise<void>
}

export function shouldRunFocusedArcaSync(lastFocusAt: number, now = Date.now()): boolean {
  return now - lastFocusAt >= FOCUS_THROTTLE_MS
}

export class ArcaProjectsSync {
  private current: ArcaSyncStatus = { ...emptyArcaSyncStatus }
  private pending?: Promise<ArcaSyncStatus>
  private inaccessibleUntil = new Map<string, number>()
  private readonly onRepoUpdated: (repoId: string) => void
  private readonly persist?: (settings: SyncSettings) => Promise<void>

  constructor(
    private store: Store,
    private changed: (status: ArcaSyncStatus) => void,
    options: ArcaProjectsSyncOptions = {}
  ) {
    this.onRepoUpdated = options.onRepoUpdated ?? (() => {})
    this.persist = options.persist
  }

  status(): ArcaSyncStatus {
    return this.current
  }

  restoreSettings(value: unknown): void {
    if (typeof value !== 'object' || value === null) {
      return
    }
    if ('autoUpdate' in value && typeof value.autoUpdate === 'boolean') {
      this.current = { ...this.current, autoUpdate: value.autoUpdate }
    }
    if (
      'inaccessibleUntil' in value &&
      typeof value.inaccessibleUntil === 'object' &&
      value.inaccessibleUntil !== null
    ) {
      for (const [repoKey, until] of Object.entries(value.inaccessibleUntil)) {
        if (typeof until === 'number' && Number.isFinite(until)) {
          this.inaccessibleUntil.set(repoKey, until)
        }
      }
    }
    this.changed(this.current)
  }

  settings(): SyncSettings {
    return {
      autoUpdate: this.current.autoUpdate,
      inaccessibleUntil: Object.fromEntries(this.inaccessibleUntil)
    }
  }

  setAutoUpdate(autoUpdate: boolean): void {
    this.current = { ...this.current, autoUpdate }
    this.changed(this.current)
  }

  syncNow(force = true): Promise<ArcaSyncStatus> {
    this.pending ??= this.run(force).finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  private async persistBackoff(): Promise<void> {
    if (!this.persist) {
      return
    }
    await this.persist({
      autoUpdate: this.current.autoUpdate,
      inaccessibleUntil: Object.fromEntries(this.inaccessibleUntil)
    })
  }

  private publish(status: Partial<ArcaSyncStatus>): void {
    this.current = { ...this.current, ...status }
    this.changed(this.current)
  }

  private async registerAndSync(
    entry: ArcaCatalogEntry,
    diskPath: string
  ): Promise<ArcaSyncRow> {
    const row: ArcaSyncRow = { ...entry, diskPath, state: 'error' }
    const registration = await addLocalRepoFromPath(this.store, diskPath)
    if ('error' in registration) {
      throw new Error(registration.error)
    }
    row.repoId = registration.repo.id
    if (!registration.alreadyExisted) {
      invalidateAuthorizedRootsCache()
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
      if (window) {
        notifyReposChanged(window)
      }
    }
    Object.assign(row, await syncArcaGit(diskPath, () => this.current.autoUpdate))
    if (row.repoId && row.state === 'updated') {
      this.onRepoUpdated(row.repoId)
    }
    return row
  }

  private async run(force: boolean): Promise<ArcaSyncStatus> {
    this.publish({ running: true, cloneProgress: undefined, diskWarning: undefined })
    let downloaded = 0
    try {
      const catalog = await loadArcaCatalog()
      if (!catalog.sources.length) {
        throw new Error(catalog.errors.join('\n'))
      }
      const disk = await scanArcaDisk(homedir())
      const projects: ArcaSyncRow[] = []
      const visibleEntries = catalog.entries.filter((entry) => !isArcaProjectExcludedByDefault(entry))
      for (const [index, entry] of visibleEntries.entries()) {
        const foundAtCatalogPath = disk.find(
          (repo) =>
            repo.repoKey === entry.repoKey &&
            normalizeRuntimePathForComparison(repo.path) ===
              normalizeRuntimePathForComparison(entry.destination)
        )
        let found = foundAtCatalogPath ?? disk.find((repo) => repo.repoKey === entry.repoKey)

        if (found && !foundAtCatalogPath) {
          const destination = await inspectArcaCloneDestination(entry.destination, entry.url)
          if (destination === 'conflict') {
            projects.push({
              ...entry,
              state: 'conflict',
              error: 'The catalog destination contains a different repository.'
            })
            continue
          }
        }

        if (!found) {
          const destination = await inspectArcaCloneDestination(entry.destination, entry.url)
          if (destination === 'arca_repo') {
            found = { repoKey: entry.repoKey, path: entry.destination }
          } else if (destination === 'conflict') {
            projects.push({
              ...entry,
              state: 'conflict',
              error: 'The catalog destination contains a different repository.'
            })
            continue
          }
          if (destination !== 'arca_repo') {
            const blockedUntil = this.inaccessibleUntil.get(entry.repoKey) ?? 0
            if (blockedUntil > Date.now() && !force) {
              projects.push({
                ...entry,
                state: 'inaccessible',
                error: `No access; retry after ${new Date(blockedUntil).toLocaleString()}.`
              })
              continue
            }
            if (!this.current.autoUpdate && !force) {
              projects.push({ ...entry, state: 'missing' })
              continue
            }
            if (!(await hasArcaDiskSpace(homedir(), MIN_FREE_BYTES))) {
              const warning = 'ARCA project sync paused: less than 2 GB is available.'
              this.publish({ diskWarning: warning })
              projects.push({ ...entry, state: 'paused', error: warning })
              continue
            }
            this.publish({
              cloneProgress: {
                current: index + 1,
                total: visibleEntries.length,
                name: entry.name,
                percent: 0
              }
            })
          try {
            await cloneArcaProject(entry, (progress) => {
              this.publish({
                cloneProgress: {
                  current: index + 1,
                  total: visibleEntries.length,
                  name: entry.name,
                  percent: progress.percent
                }
              })
            })
            downloaded++
            found = { repoKey: entry.repoKey, path: entry.destination }
            disk.push(found)
            this.inaccessibleUntil.delete(entry.repoKey)
            await this.persistBackoff()
          } catch (error) {
            if (isCloneAccessError(error)) {
              const until = Date.now() + ACCESS_BACKOFF_MS
              this.inaccessibleUntil.set(entry.repoKey, until)
              await this.persistBackoff()
              projects.push({ ...entry, state: 'inaccessible', error: String(error) })
            } else {
              projects.push({ ...entry, state: 'error', error: String(error) })
            }
            continue
          }
          }
        }

        if (!found) {
          continue
        }
        try {
          projects.push(await this.registerAndSync(entry, found.path))
        } catch (error) {
          projects.push({ ...entry, diskPath: found.path, state: 'error', error: String(error) })
        }
      }
      this.publish({
        projects,
        sources: catalog.sources,
        errors: catalog.errors,
        outside: disk.filter(
          (repo) => !catalog.entries.some((entry) => entry.repoKey === repo.repoKey)
        ),
        lastSync: new Date().toISOString(),
        cloneProgress: undefined
      })
    } catch (error) {
      this.publish({ errors: [String(error)], cloneProgress: undefined })
    } finally {
      this.publish({ running: false })
      if (downloaded > 0 && Notification.isSupported()) {
        new Notification({
          title: 'ARCA',
          body: `${downloaded} ARCA project${downloaded === 1 ? '' : 's'} downloaded`
        }).show()
      }
    }
    return this.current
  }
}

export { registerArcaProjectsSync } from './registration'
