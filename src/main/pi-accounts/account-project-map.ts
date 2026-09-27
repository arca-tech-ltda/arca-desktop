import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import {
  emptyPiAccountProjectMap,
  normalizeProjectPathKey,
  PI_ACCOUNT_PROJECTS_FILE,
  PI_ACCOUNT_PROJECTS_VERSION,
  resolvePiAccountSelectionForLaunch,
  type PiAccountProjectMap,
  type PiAccountProjectSelection,
  type PiAccountProjectsState,
  type PiAccountSession
} from '../../shared/pi-account-projects'
import { withPiFileLock } from './auth-lock'
import { readJson, writeJson } from './files'
import { isPiAccountSelectionSupported } from './pi-account-selection-support'

const selectionSchema = z
  .object({ anthropic: z.string().optional(), 'openai-codex': z.string().optional() })
  .strip()

const mapSchema = z.object({
  version: z.literal(PI_ACCOUNT_PROJECTS_VERSION),
  projects: z.record(z.string(), selectionSchema)
})

function normalizeMap(map: PiAccountProjectMap): PiAccountProjectMap {
  const projects: Record<string, PiAccountProjectSelection> = {}
  for (const [path, selection] of Object.entries(map.projects)) {
    const key = normalizeProjectPathKey(path)
    if (key && Object.keys(selection).length > 0) {
      projects[key] = { ...projects[key], ...selection }
    }
  }
  return { version: PI_ACCOUNT_PROJECTS_VERSION, projects }
}

/**
 * Project → Pi account, local to this computer (contract v1 §6). Written only by the app;
 * the in-memory copy is what the PTY spawn path reads, so injection never waits on disk.
 */
export class PiAccountProjectsService {
  private readonly agentDir: string
  private map: PiAccountProjectMap = emptyPiAccountProjectMap()
  private readonly sessions = new Map<string, PiAccountSession>()
  private readonly listeners = new Set<(state: PiAccountProjectsState) => void>()
  private pending: Promise<unknown> = Promise.resolve()

  constructor(options: { agentDir?: string } = {}) {
    this.agentDir =
      options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')
  }

  private get filePath(): string {
    return join(this.agentDir, PI_ACCOUNT_PROJECTS_FILE)
  }

  private async readFile(): Promise<PiAccountProjectMap> {
    const parsed = mapSchema.safeParse(await readJson(this.filePath, emptyPiAccountProjectMap()))
    return parsed.success ? normalizeMap(parsed.data) : emptyPiAccountProjectMap()
  }

  async load(): Promise<PiAccountProjectMap> {
    try {
      this.map = await this.readFile()
    } catch (error) {
      console.warn('[pi-accounts] Could not read the project account map:', error)
      this.map = emptyPiAccountProjectMap()
    }
    this.publish()
    return this.map
  }

  getMap(): PiAccountProjectMap {
    return this.map
  }

  getState(): PiAccountProjectsState {
    return {
      supported: isPiAccountSelectionSupported(),
      map: this.map,
      sessions: [...this.sessions.values()]
    }
  }

  /** The accounts a launch in this project should use. Empty when Pi has no support yet. */
  resolveSelection(paths: { projectPath?: string | null; cwd?: string | null }): PiAccountProjectSelection {
    if (!isPiAccountSelectionSupported()) {
      return {}
    }
    return resolvePiAccountSelectionForLaunch(this.map, paths)
  }

  setProjectAccount(
    projectPath: string,
    provider: PiAccountProvider,
    name: string | null
  ): Promise<PiAccountProjectMap> {
    return this.mutate((map) => {
      const key = normalizeProjectPathKey(projectPath)
      if (!key) {
        return
      }
      const selection = { ...map.projects[key] }
      if (name) {
        selection[provider] = name
      } else {
        delete selection[provider]
      }
      if (Object.keys(selection).length > 0) {
        map.projects[key] = selection
      } else {
        delete map.projects[key]
      }
    })
  }

  /** Contract v1 §7: a rename must not orphan the projects pointing at the old name. */
  renameAccount(provider: PiAccountProvider, from: string, to: string): Promise<PiAccountProjectMap> {
    return this.mutate((map) => {
      for (const selection of Object.values(map.projects)) {
        if (selection[provider] === from) {
          selection[provider] = to
        }
      }
    })
  }

  /** Projects (normalized paths) that pinned this account. */
  getProjectsUsingAccount(provider: PiAccountProvider, name: string): string[] {
    return Object.entries(this.map.projects)
      .filter(([, selection]) => selection[provider] === name)
      .map(([path]) => path)
  }

  getSessionsUsingAccount(provider: PiAccountProvider, name: string): PiAccountSession[] {
    return [...this.sessions.values()].filter(
      (session) => session.provider === provider && session.name === name
    )
  }

  recordSession(session: PiAccountSession): void {
    const key = `${session.tabId}:${session.provider}`
    const existing = this.sessions.get(key)
    if (existing?.name === session.name && existing.worktreeId === session.worktreeId) {
      return
    }
    this.sessions.set(key, session)
    this.publish()
  }

  /** Renderer-authoritative pruning: terminals it no longer lists are gone. */
  syncOpenTabs(tabIds: readonly string[]): void {
    const open = new Set(tabIds)
    let changed = false
    for (const [key, session] of this.sessions) {
      if (!open.has(session.tabId)) {
        this.sessions.delete(key)
        changed = true
      }
    }
    if (changed) {
      this.publish()
    }
  }

  onChange(listener: (state: PiAccountProjectsState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(): void {
    const state = this.getState()
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  private mutate(change: (map: PiAccountProjectMap) => void): Promise<PiAccountProjectMap> {
    const next = this.pending.then(() =>
      withPiFileLock(this.filePath, async () => {
        // Re-read inside the lock: another window (or a future `/accounts project`) may have written.
        const map = await this.readFile()
        const before = JSON.stringify(map)
        change(map)
        if (JSON.stringify(map) !== before) {
          await writeJson(this.filePath, map)
        }
        this.map = map
        this.publish()
        return map
      })
    )
    this.pending = next.catch(() => {})
    return next
  }
}

let instance: PiAccountProjectsService | null = null

/** Single reader for the PTY spawn paths; set once when the IPC surface registers. */
export function getPiAccountProjectsService(): PiAccountProjectsService | null {
  return instance
}

export function setPiAccountProjectsService(service: PiAccountProjectsService | null): void {
  instance = service
}
