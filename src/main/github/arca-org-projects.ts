import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type {
  ArcaGitHubRepository,
  ArcaProjectCandidate,
  ArcaProjectDestinationInspection,
  ArcaProjectsListResult
} from '../../shared/arca-projects-types'
import { extractExecError, ghExecFileAsync, gitExecFileAsync } from './gh-utils'

const ARCA_ORG = 'arca-tech-ltda'

type CatalogRepo = { url?: string; repo_id?: string; path?: string }
type CatalogProject = { pending_transfer?: boolean; repos?: CatalogRepo[] }
type ArcaCatalog = { root_default?: string; projects?: CatalogProject[] }

function repoName(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.git$/i, '')
  return normalized.split('/').at(-1)?.toLowerCase() ?? null
}

function expandHome(value: string, home: string): string {
  if (value === '~') {
    return home
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(home, value.slice(2))
  }
  return value
}

export function reconcileArcaProjects(args: {
  repositories: readonly ArcaGitHubRepository[]
  catalog: ArcaCatalog
  home: string
  inspections: Readonly<Record<string, ArcaProjectDestinationInspection>>
  includeHidden?: boolean
}): { projects: ArcaProjectCandidate[]; hiddenCount: number } {
  const root = expandHome(args.catalog.root_default ?? '~/ARCA', args.home)
  const catalogPaths = new Map<string, string>()
  for (const project of args.catalog.projects ?? []) {
    for (const repo of project.repos ?? []) {
      const name = repoName(repo.repo_id) ?? repoName(repo.url)
      if (name && repo.path) {
        catalogPaths.set(name, path.resolve(root, repo.path))
      }
    }
  }

  let hiddenCount = 0
  const projects = args.repositories.flatMap((repository) => {
    if (
      !args.includeHidden &&
      (repository.isArchived || repository.name.toLowerCase() === 'brain')
    ) {
      hiddenCount += 1
      return []
    }
    const catalogPath = catalogPaths.get(repository.name.toLowerCase())
    const destination = catalogPath ?? path.join(args.home, 'ARCA', 'clientes', repository.name)
    const inspection = args.inspections[destination] ?? { diskState: 'missing' as const }
    return [
      {
        ...repository,
        destination,
        catalogued: catalogPath !== undefined,
        selected: catalogPath !== undefined || inspection.diskState === 'arca_repo',
        ...inspection
      }
    ]
  })
  return { projects, hiddenCount }
}

function isArcaRemote(remote: string): boolean {
  const normalized = remote.toLowerCase().replace(/\\/g, '/')
  return (
    normalized.includes(`github.com/${ARCA_ORG.toLowerCase()}/`) ||
    normalized.includes(`github.com:${ARCA_ORG.toLowerCase()}/`)
  )
}

export async function inspectArcaProjectDestination(
  destination: string
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
  try {
    const { stdout } = await gitExecFileAsync(['config', '--get-regexp', '^remote\\..*\\.url$'], {
      cwd: destination,
      timeout: 10_000
    })
    const remotes = stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1) ?? '')
      .filter(Boolean)
    return remotes.some(isArcaRemote)
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

function classifyListError(error: unknown): ArcaProjectsListResult {
  const { stderr } = extractExecError(error)
  const message = stderr || (error instanceof Error ? error.message : String(error))
  if (/enoent|not found|not recognized|could not resolve executable/i.test(message)) {
    return { ok: false, reason: 'gh_missing', message }
  }
  if (/auth login|authentication|not logged|401|token/i.test(message)) {
    return { ok: false, reason: 'gh_auth', message }
  }
  return { ok: false, reason: 'unknown', message }
}

export async function listArcaOrgProjects(includeHidden = false): Promise<ArcaProjectsListResult> {
  const home = homedir()
  try {
    const [ghResult, catalogText] = await Promise.all([
      ghExecFileAsync([
        'repo',
        'list',
        ARCA_ORG,
        '--limit',
        '200',
        '--json',
        'name,description,isArchived,url,sshUrl,pushedAt'
      ]),
      readFile(path.join(home, 'ARCA', 'arca', 'projects.json'), 'utf8')
    ])
    const repositories: ArcaGitHubRepository[] = JSON.parse(ghResult.stdout)
    const catalog: ArcaCatalog = JSON.parse(catalogText)
    const destinations = new Set<string>()
    const initial = reconcileArcaProjects({ repositories, catalog, home, inspections: {} })
    for (const project of initial.projects) {
      destinations.add(project.destination)
    }
    const inspectionEntries = await Promise.all(
      [...destinations].map(
        async (destination) =>
          [destination, await inspectArcaProjectDestination(destination)] as const
      )
    )
    return {
      ok: true,
      ...reconcileArcaProjects({
        repositories,
        catalog,
        home,
        inspections: Object.fromEntries(inspectionEntries),
        includeHidden
      })
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, reason: 'catalog', message: error.message }
    }
    return classifyListError(error)
  }
}
