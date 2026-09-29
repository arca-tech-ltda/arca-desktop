import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { isTrustedUIRenderer } from '../ipc/ui'
import type { Store } from '../persistence'
import {
  isArcaProjectType,
  validateArcaProjectSlug,
  type ArcaProjectCreationRequest,
  type ArcaProjectCreationResult
} from '../../shared/arca-project-creation'
import { runArcaProjectCreation } from './create-project-flow'
import { createArcaProjectCreationDependencies } from './service'
import { arcaPublishEligibility } from './publish-eligibility'

function parseRequest(value: unknown): ArcaProjectCreationRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid project request')
  }
  const record: Record<string, unknown> = { ...value }
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const problem = validateArcaProjectSlug(name)
  if (problem) {
    throw new Error(`Invalid project name (${problem})`)
  }
  if (!isArcaProjectType(record.type)) {
    throw new Error('Invalid project type')
  }
  if (record.sourcePath !== undefined && typeof record.sourcePath !== 'string') {
    throw new Error('Invalid source path')
  }
  return {
    name,
    type: record.type,
    description: typeof record.description === 'string' ? record.description : '',
    ...(typeof record.title === 'string' && record.title.trim()
      ? { title: record.title.trim() }
      : {}),
    ...(typeof record.sourcePath === 'string' && record.sourcePath
      ? { sourcePath: record.sourcePath }
      : {}),
    ...(record.moveToArcaRoot === true ? { moveToArcaRoot: true } : {}),
    ...(typeof record.remoteName === 'string' && record.remoteName
      ? { remoteName: record.remoteName }
      : {})
  }
}

let registered = false

export function registerArcaProjectCreation(store: Store): void {
  if (registered) {
    return
  }
  registered = true
  ipcMain.handle(
    'arcaProjectCreate:run',
    async (event, value: unknown): Promise<ArcaProjectCreationResult> => {
      if (!isTrustedUIRenderer(event.sender)) {
        throw new Error('Untrusted project creation caller')
      }
      const request = parseRequest(value)
      const requestId = randomUUID()
      return runArcaProjectCreation(
        request,
        createArcaProjectCreationDependencies(store),
        (steps) => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
              window.webContents.send('arcaProjectCreate:progress', { requestId, steps })
            }
          }
        }
      )
    }
  )
  ipcMain.handle('arcaProjectCreate:publishEligibility', async (event, projectPath: unknown) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project creation caller')
    }
    if (typeof projectPath !== 'string') {
      throw new Error('Invalid project path')
    }
    return arcaPublishEligibility(projectPath)
  })
}
