import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  emptyManagedAccountProjectMap,
  MANAGED_ACCOUNT_PROJECTS_FILE,
  MANAGED_ACCOUNT_PROJECTS_VERSION,
  resolveManagedAccountSelectionForLaunch,
  type ManagedAccountAgent,
  type ManagedAccountOption,
  type ManagedAccountProjectMap,
  type ManagedAccountProjectSelection,
  type ManagedAccountProjectsState,
  type ManagedAccountSession
} from '../../shared/managed-account-projects'
import { normalizeProjectPathKey } from '../../shared/project-account-paths'
import type { ClaudeManagedAccount, CodexManagedAccount } from '../../shared/managed-account-types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

const selectionSchema = z
  .object({ claude: z.string().optional(), codex: z.string().optional() })
  .strip()

const mapSchema = z.object({
  version: z.literal(MANAGED_ACCOUNT_PROJECTS_VERSION),
  projects: z.record(z.string(), selectionSchema)
})

export type ManagedAccountSettingsSource = {
  getSettings: () => {
    claudeManagedAccounts?: ClaudeManagedAccount[]
    codexManagedAccounts?: CodexManagedAccount[]
  }
}

function normalizeMap(map: ManagedAccountProjectMap): ManagedAccountProjectMap {
  const projects: Record<string, ManagedAccountProjectSelection> = {}
  for (const [path, selection] of Object.entries(map.projects)) {
    const key = normalizeProjectPathKey(path)
    if (key && Object.keys(selection).length > 0) {
      projects[key] = { ...projects[key], ...selection }
    }
  }
  return { version: MANAGED_ACCOUNT_PROJECTS_VERSION, projects }
}

/** WSL accounts keep their credentials inside the distro; only host accounts can be pinned. */
function isHostClaudeAccount(account: ClaudeManagedAccount): boolean {
  return account.managedAuthRuntime !== 'wsl'
}

function isHostCodexAccount(account: CodexManagedAccount): boolean {
  return account.managedHomeRuntime !== 'wsl'
}

/**
 * Project → managed Claude/Codex account, local to this computer. Written only by the app; the
 * in-memory copy is what the PTY spawn path reads, so injection never waits on disk. Mirrors
 * `PiAccountProjectsService`, with account ids instead of bucket account names.
 */
export class ManagedAccountProjectsService {
  private readonly filePath: string
  private readonly settings: ManagedAccountSettingsSource
  private map: ManagedAccountProjectMap = emptyManagedAccountProjectMap()
  private readonly sessions = new Map<string, ManagedAccountSession>()
  private readonly listeners = new Set<(state: ManagedAccountProjectsState) => void>()
  private pending: Promise<unknown> = Promise.resolve()

  constructor(options: { userDataPath: string; settings: ManagedAccountSettingsSource }) {
    this.filePath = join(options.userDataPath, MANAGED_ACCOUNT_PROJECTS_FILE)
    this.settings = options.settings
  }

  private readFile(): ManagedAccountProjectMap {
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf-8')
    } catch {
      return emptyManagedAccountProjectMap()
    }
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw.replace(/^\uFEFF/u, ''))
    } catch {
      return emptyManagedAccountProjectMap()
    }
    const parsed = mapSchema.safeParse(parsedJson)
    return parsed.success ? normalizeMap(parsed.data) : emptyManagedAccountProjectMap()
  }

  load(): ManagedAccountProjectMap {
    this.map = this.readFile()
    this.publish()
    return this.map
  }

  getMap(): ManagedAccountProjectMap {
    return this.map
  }

  /** Host managed accounts the user can pin, newest sign-in first. */
  listAccounts(): ManagedAccountOption[] {
    const settings = this.settings.getSettings()
    const claude = (settings.claudeManagedAccounts ?? [])
      .filter(isHostClaudeAccount)
      .map((account) => ({ agent: 'claude' as const, id: account.id, label: account.email }))
    const codex = (settings.codexManagedAccounts ?? [])
      .filter(isHostCodexAccount)
      .map((account) => ({ agent: 'codex' as const, id: account.id, label: account.email }))
    return [...claude, ...codex]
  }

  hasAccount(agent: ManagedAccountAgent, accountId: string): boolean {
    return this.listAccounts().some(
      (account) => account.agent === agent && account.id === accountId
    )
  }

  accountLabel(agent: ManagedAccountAgent, accountId: string): string {
    return (
      this.listAccounts().find((account) => account.agent === agent && account.id === accountId)
        ?.label ?? accountId
    )
  }

  getState(): ManagedAccountProjectsState {
    return {
      supported: true,
      map: this.map,
      sessions: [...this.sessions.values()],
      accounts: this.listAccounts()
    }
  }

  /** The accounts a launch in this project should use. */
  resolveSelection(paths: {
    projectPath?: string | null
    cwd?: string | null
  }): ManagedAccountProjectSelection {
    return resolveManagedAccountSelectionForLaunch(this.map, paths)
  }

  setProjectAccount(
    projectPath: string,
    agent: ManagedAccountAgent,
    accountId: string | null
  ): Promise<ManagedAccountProjectMap> {
    return this.mutate((map) => {
      const key = normalizeProjectPathKey(projectPath)
      if (!key) {
        return
      }
      const selection = { ...map.projects[key] }
      if (accountId) {
        selection[agent] = accountId
      } else {
        delete selection[agent]
      }
      if (Object.keys(selection).length > 0) {
        map.projects[key] = selection
      } else {
        delete map.projects[key]
      }
    })
  }

  /** Projects (normalized paths) pinned to this account. */
  getProjectsUsingAccount(agent: ManagedAccountAgent, accountId: string): string[] {
    return Object.entries(this.map.projects)
      .filter(([, selection]) => selection[agent] === accountId)
      .map(([path]) => path)
  }

  getSessionsUsingAccount(agent: ManagedAccountAgent, accountId: string): ManagedAccountSession[] {
    return [...this.sessions.values()].filter(
      (session) => session.agent === agent && session.accountId === accountId
    )
  }

  /** Removing an account must not leave projects pointing at an id that no longer resolves. */
  forgetAccount(agent: ManagedAccountAgent, accountId: string): Promise<ManagedAccountProjectMap> {
    return this.mutate((map) => {
      for (const [key, selection] of Object.entries(map.projects)) {
        if (selection[agent] !== accountId) {
          continue
        }
        delete selection[agent]
        if (Object.keys(selection).length === 0) {
          delete map.projects[key]
        }
      }
    })
  }

  recordSession(session: ManagedAccountSession): void {
    const key = `${session.tabId}:${session.agent}`
    const existing = this.sessions.get(key)
    if (existing?.accountId === session.accountId && existing.worktreeId === session.worktreeId) {
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

  onChange(listener: (state: ManagedAccountProjectsState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(): void {
    const state = this.getState()
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  private mutate(
    change: (map: ManagedAccountProjectMap) => void
  ): Promise<ManagedAccountProjectMap> {
    const next = this.pending.then(() => {
      // Re-read before each write: a second window may have changed another project meanwhile.
      const map = this.readFile()
      const before = JSON.stringify(map)
      change(map)
      if (JSON.stringify(map) !== before) {
        mkdirSync(dirname(this.filePath), { recursive: true })
        writeFileAtomically(this.filePath, `${JSON.stringify(map, null, 2)}\n`)
      }
      this.map = map
      this.publish()
      return map
    })
    this.pending = next.catch(() => {})
    return next
  }
}

let instance: ManagedAccountProjectsService | null = null

/** Single reader for the PTY spawn paths; set when the `managed` authority registers its IPC. */
export function getManagedAccountProjectsService(): ManagedAccountProjectsService | null {
  return instance
}

export function setManagedAccountProjectsService(
  service: ManagedAccountProjectsService | null
): void {
  instance = service
}
