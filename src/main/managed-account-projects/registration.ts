import { app, BrowserWindow, ipcMain } from 'electron'
import {
  MANAGED_ACCOUNT_AGENTS,
  type ManagedAccountAgent
} from '../../shared/managed-account-projects'
import { isTrustedUIRenderer } from '../ipc/ui'
import {
  ManagedAccountProjectsService,
  setManagedAccountProjectsService,
  type ManagedAccountSettingsSource
} from './managed-account-project-map'
import {
  materializeClaudeManagedCredential,
  setManagedAccountSettingsReader
} from './managed-account-homes'

const MANAGED_ACCOUNT_IPC_CHANNELS = [
  'managedAccountProjects:get',
  'managedAccountProjects:set',
  'managedAccountProjects:syncOpenTabs'
] as const

let service: ManagedAccountProjectsService | null = null
let stop: (() => void) | null = null

function assertAgent(agent: unknown): ManagedAccountAgent {
  if (agent !== 'claude' && agent !== 'codex') {
    throw new Error('Invalid managed account agent')
  }
  return agent
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && isTrustedUIRenderer(window.webContents)) {
      window.webContents.send(channel, payload)
    }
  }
}

/** Only called while the machine is in `managed` authority mode; idempotent. */
export function registerManagedAccountProjects(
  settings: ManagedAccountSettingsSource,
  userDataPath = app.getPath('userData')
): void {
  if (service) {
    return
  }
  const projects = new ManagedAccountProjectsService({ userDataPath, settings })
  service = projects
  setManagedAccountProjectsService(projects)
  setManagedAccountSettingsReader(() => settings.getSettings())
  projects.load()
  void materializePinnedClaudeCredentials(projects)
  ipcMain.handle('managedAccountProjects:get', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted managed accounts caller')
    }
    return projects.getState()
  })
  ipcMain.handle(
    'managedAccountProjects:set',
    async (event, projectPath: unknown, agent: unknown, accountId: unknown) => {
      if (!isTrustedUIRenderer(event.sender)) {
        throw new Error('Untrusted managed accounts caller')
      }
      if (typeof projectPath !== 'string' || !projectPath.trim() || projectPath.length > 4096) {
        throw new Error('Invalid managed account project')
      }
      const target = assertAgent(agent)
      if (accountId !== null && (typeof accountId !== 'string' || accountId.length > 256)) {
        throw new Error('Invalid managed account id')
      }
      if (accountId !== null && !projects.hasAccount(target, accountId)) {
        return { status: 'unknown-account', state: projects.getState() }
      }
      await projects.setProjectAccount(projectPath, target, accountId)
      if (accountId !== null && target === 'claude') {
        // Seed the Keychain item for this config dir now: the runtime spawn path is synchronous.
        void materializeClaudeManagedCredential(accountId)
      }
      return { status: 'saved', state: projects.getState() }
    }
  )
  ipcMain.handle('managedAccountProjects:syncOpenTabs', (event, tabIds: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted managed accounts caller')
    }
    projects.syncOpenTabs(
      Array.isArray(tabIds) ? tabIds.filter((id) => typeof id === 'string') : []
    )
    return projects.getState()
  })
  const stopChange = projects.onChange((state) =>
    broadcast('managedAccountProjects:changed', state)
  )
  stop = () => stopChange()
  app.once('before-quit', () => unregisterManagedAccountProjects())
}

/** Leaving `managed` authority: the surfaces stop existing, including the PTY env injection. */
export function unregisterManagedAccountProjects(): void {
  if (!stop) {
    return
  }
  stop()
  stop = null
  service = null
  setManagedAccountProjectsService(null)
  setManagedAccountSettingsReader(null)
  for (const channel of MANAGED_ACCOUNT_IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }
}

async function materializePinnedClaudeCredentials(
  projects: ManagedAccountProjectsService
): Promise<void> {
  const pinned = new Set<string>()
  for (const selection of Object.values(projects.getMap().projects)) {
    for (const agent of MANAGED_ACCOUNT_AGENTS) {
      if (agent === 'claude' && selection[agent]) {
        pinned.add(selection[agent])
      }
    }
  }
  for (const accountId of pinned) {
    await materializeClaudeManagedCredential(accountId).catch(() => false)
  }
}
