import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type {
  ArcaProjectDestinationInspection,
  ArcaProjectsListResult
} from '../../shared/arca-projects-types'
import { isArcaProjectExcludedByDefault } from '../../shared/arca-product'
import { gitExecFileAsync } from './gh-utils'
import { loadArcaCatalog, normalizeArcaRemote } from '../arca-projects-sync/catalog'
import { scanArcaDisk } from '../arca-projects-sync/disk'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import { ARCA_ORG } from '../../shared/arca-project-creation'

function isArcaRemote(remote: string): boolean {
  return normalizeArcaRemote(remote)?.startsWith(`github.com/${ARCA_ORG}/`) === true
}

export async function inspectArcaProjectDestination(
  destination: string,
  expectedRemote?: string
): Promise<ArcaProjectDestinationInspection> {
  try {
    const destinationStat = await stat(destination)
    if (!destinationStat.isDirectory()) {
      return { diskState: 'conflict', diskError: 'The destination exists and is not a folder.' }
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { diskState: 'missing' }
    }
    throw error
  }
  const paths = isWindowsAbsolutePathLike(destination) ? path.win32 : path
  try {
    await stat(paths.join(destination, '.git'))
    const { stdout } = await gitExecFileAsync(['config', '--get', 'remote.origin.url'], {
      cwd: destination,
      timeout: 10_000
    })
    const remotes = stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1) ?? '')
      .filter(Boolean)
    return remotes.some((remote) =>
      expectedRemote
        ? normalizeArcaRemote(expectedRemote) !== null &&
          normalizeArcaRemote(remote) === normalizeArcaRemote(expectedRemote)
        : isArcaRemote(remote)
    )
      ? { diskState: 'arca_repo' }
      : {
          diskState: 'conflict',
          diskError: 'The destination is a Git repository with a different remote.'
        }
  } catch {
    return {
      diskState: 'conflict',
      diskError: 'The destination already exists and is not an ARCA Git repository.'
    }
  }
}

export async function listArcaOrgProjects(includeHidden = false): Promise<ArcaProjectsListResult> {
  try {
    const catalog = await loadArcaCatalog()
    if (!catalog.sources.length) {
      return { ok: false, reason: 'catalog', message: catalog.errors.join('\n') }
    }
    const disk = await scanArcaDisk(homedir())
    const hiddenCount = catalog.entries.filter(isArcaProjectExcludedByDefault).length
    const entries = includeHidden
      ? catalog.entries
      : catalog.entries.filter((entry) => !isArcaProjectExcludedByDefault(entry))
    const projects = await Promise.all(
      entries.map(async (entry) => {
        const found = disk.find((repo) => repo.repoKey === entry.repoKey)
        const destination = found?.path ?? entry.destination
        return {
          name: entry.name,
          description: entry.title ?? entry.description ?? entry.repoKey,
          isArchived: entry.archived === true,
          url: entry.url,
          sshUrl: entry.url,
          pushedAt: '',
          destination,
          catalogued: entry.source !== 'github',
          selected: !found,
          ...(await inspectArcaProjectDestination(destination, entry.url))
        }
      })
    )
    return { ok: true, projects, hiddenCount }
  } catch (error) {
    return { ok: false, reason: 'unknown', message: String(error) }
  }
}
