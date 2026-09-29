import { ghExecFileAsync } from '../git/runner'
import { ARCA_ORG } from '../../shared/arca-project-creation'

const DISCOVERY_TTL_MS = 10 * 60_000
const DISCOVERY_TIMEOUT_MS = 10_000
const DISCOVERY_LIMIT = '200'

export type ArcaOrgRepo = {
  url: string
  description?: string
  isArchived?: boolean
}

let cache: { repos: ArcaOrgRepo[]; expires: number } | undefined
let pending: Promise<ArcaOrgRepo[]> | undefined

/** Test seam: the cache is module state shared by every catalog load. */
export function resetArcaOrgDiscoveryCache(): void {
  cache = undefined
  pending = undefined
}

export function parseArcaOrgRepos(stdout: string): ArcaOrgRepo[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.flatMap((repo): ArcaOrgRepo[] => {
    if (typeof repo !== 'object' || repo === null || !('url' in repo)) {
      return []
    }
    const record: Record<string, unknown> = { ...repo }
    return typeof record.url === 'string'
      ? [
          {
            url: record.url,
            ...(typeof record.description === 'string' && record.description
              ? { description: record.description }
              : {}),
            isArchived: record.isArchived === true
          }
        ]
      : []
  })
}

/**
 * Every repository in the ARCA org, so one created outside projects.json is still offered.
 * One paginated `gh repo list` per 10 minutes, and a missing or logged-out gh resolves to
 * an empty list (cached the same way) so the catalog load never waits on it twice.
 */
export async function discoverArcaOrgRepos(): Promise<ArcaOrgRepo[]> {
  if (cache && cache.expires > Date.now()) {
    return cache.repos
  }
  pending ??= ghExecFileAsync(
    ['repo', 'list', ARCA_ORG, '--limit', DISCOVERY_LIMIT, '--json', 'url,description,isArchived'],
    { timeout: DISCOVERY_TIMEOUT_MS }
  )
    .then(({ stdout }) => parseArcaOrgRepos(stdout))
    .catch(() => [])
    .then((repos) => {
      cache = { repos, expires: Date.now() + DISCOVERY_TTL_MS }
      return repos
    })
    .finally(() => {
      pending = undefined
    })
  return pending
}
