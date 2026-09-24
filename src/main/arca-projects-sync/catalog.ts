import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { object, readCredential, megamindConfigPath } from '../arca-megamind/credentials'
import { callTool } from '../arca-megamind/gateway'
import { ghExecFileAsync } from '../git/runner'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import type { ArcaCatalogEntry } from '../../shared/arca-projects-sync'

export function normalizeArcaRemote(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^[^@/]+@([^:]+):/, '$1/')
    .replace(/^ssh:\/\/(?:[^@/]+@)?/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
  return /^[a-z0-9.-]+(?::\d+)?\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(value) ? value : null
}

function catalogFlag(record: Record<string, unknown>, flag: 'archived' | 'legacy'): boolean {
  if (record[flag] === true || (flag === 'legacy' && record.legado === true)) {
    return true
  }
  return typeof record.status === 'string' && record.status.toLowerCase() === flag
}

export function catalogDestination(home: string, relative: string): string {
  const paths = isWindowsAbsolutePathLike(home) ? path.win32 : path
  const root = paths.join(home, 'ARCA')
  const destination = paths.resolve(root, relative)
  const within = paths.relative(root, destination)
  if (within.startsWith('..') || paths.isAbsolute(within)) {
    throw new Error('Catalog path escapes ARCA')
  }
  return destination
}

export function parseCatalog(
  value: unknown,
  source: ArcaCatalogEntry['source'],
  home: string
): ArcaCatalogEntry[] {
  if (!object(value)) {
    throw new Error('Invalid catalog')
  }
  const projects = value.projects ?? value.items
  if (!Array.isArray(projects)) {
    throw new Error('Invalid catalog projects')
  }
  return projects.flatMap((project) => {
    if (!object(project) || !Array.isArray(project.repos)) {
      return []
    }
    return project.repos.flatMap((repo: unknown) => {
      const record = object(repo) ? repo : { repo_key: repo }
      const remote = record.repo_key ?? record.url ?? record.repo_id
      if (typeof remote !== 'string') {
        return []
      }
      const repoKey = normalizeArcaRemote(remote)
      if (!repoKey) {
        return []
      }
      const name = repoKey.split('/').at(-1)!
      const relative = typeof record.path === 'string' ? record.path : `clientes/${name}`
      return [
        {
          repoKey,
          name,
          url: `https://${repoKey}.git`,
          destination: catalogDestination(home, relative),
          pathFromCatalog: typeof record.path === 'string',
          archived:
            catalogFlag(project, 'archived') ||
            catalogFlag(record, 'archived') ||
            record.isArchived === true,
          legacy: catalogFlag(project, 'legacy') || catalogFlag(record, 'legacy'),
          source
        }
      ]
    })
  })
}

export function unionCatalogs(...catalogs: ArcaCatalogEntry[][]): ArcaCatalogEntry[] {
  const result = new Map<string, ArcaCatalogEntry>()
  for (const catalog of catalogs) {
    for (const entry of catalog) {
      const prior = result.get(entry.repoKey)
      if (!prior) {
        result.set(entry.repoKey, entry)
      }
      // Mainframe currently publishes identity only; the file owns the established layout.
      else {
        const visibility = {
          archived: prior.archived === true || entry.archived === true,
          legacy: prior.legacy === true || entry.legacy === true
        }
        if (prior.source === 'mainframe' && !prior.pathFromCatalog && entry.source === 'file') {
          result.set(entry.repoKey, { ...prior, ...visibility, destination: entry.destination })
        } else if (visibility.archived !== prior.archived || visibility.legacy !== prior.legacy) {
          result.set(entry.repoKey, { ...prior, ...visibility })
        }
      }
    }
  }
  return [...result.values()]
}

export async function loadArcaCatalog(
  home = homedir()
): Promise<{ entries: ArcaCatalogEntry[]; sources: string[]; errors: string[] }> {
  const catalogs: ArcaCatalogEntry[][] = []
  const sources: string[] = []
  const errors: string[] = []
  try {
    const credential = await readCredential(
      megamindConfigPath(),
      process.env.NODE_ENV === 'development'
    )
    const entries: ArcaCatalogEntry[] = []
    let cursor: string | undefined
    const seen = new Set<string>()
    do {
      const page = await callTool(fetch, credential, 'projects_list', {
        limit: 100,
        ...(cursor ? { cursor } : {})
      })
      entries.push(...parseCatalog(page, 'mainframe', home))
      cursor = typeof page.next_cursor === 'string' ? page.next_cursor : undefined
      if (cursor && seen.has(cursor)) {
        throw new Error('Repeated catalog cursor')
      }
      if (cursor) {
        seen.add(cursor)
      }
    } while (cursor)
    catalogs.push(entries)
    sources.push('mainframe')
  } catch (error) {
    errors.push(`Mainframe: ${String(error)}`)
  }
  try {
    catalogs.push(
      parseCatalog(
        JSON.parse(await readFile(path.join(home, 'ARCA', 'arca', 'projects.json'), 'utf8')),
        'file',
        home
      )
    )
    sources.push('file')
  } catch (error) {
    errors.push(`projects.json: ${String(error)}`)
  }
  try {
    const { stdout } = await ghExecFileAsync(
      ['repo', 'list', 'arca-tech-ltda', '--limit', '1000', '--json', 'url,isArchived'],
      { timeout: 30_000 }
    )
    const repos: unknown = JSON.parse(stdout)
    catalogs.push(parseCatalog({ projects: [{ repos }] }, 'github', home))
    sources.push('github')
  } catch (error) {
    errors.push(`GitHub: ${String(error)}`)
  }
  return { entries: unionCatalogs(...catalogs), sources, errors }
}
