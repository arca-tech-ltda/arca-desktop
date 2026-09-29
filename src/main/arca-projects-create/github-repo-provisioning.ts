import { ghExecFileAsync } from '../git/runner'
import { ARCA_ORG } from '../../shared/arca-project-creation'

const VIEW_TIMEOUT_MS = 30_000
const CREATE_TIMEOUT_MS = 60_000

export type ArcaRepositoryProvision = {
  repo: string
  url: string
  created: boolean
}

function repoAlreadyExists(error: unknown): boolean {
  return /already exists|name already exists on this account/i.test(String(error))
}

/**
 * Idempotent on purpose: a run that failed after `gh repo create` must be resumable
 * without ever deleting what GitHub already has.
 */
export async function ensureArcaRepository(input: {
  name: string
  description: string
  addReadme: boolean
}): Promise<ArcaRepositoryProvision> {
  const repo = `${ARCA_ORG}/${input.name}`
  const url = `https://github.com/${repo}.git`
  try {
    await ghExecFileAsync(['repo', 'view', repo, '--json', 'name'], { timeout: VIEW_TIMEOUT_MS })
    return { repo, url, created: false }
  } catch (error) {
    if (!/could not resolve|not found|404/i.test(String(error))) {
      throw error
    }
  }
  try {
    await ghExecFileAsync(
      [
        'repo',
        'create',
        repo,
        '--private',
        '--description',
        input.description,
        ...(input.addReadme ? ['--add-readme'] : [])
      ],
      { timeout: CREATE_TIMEOUT_MS, idempotent: false }
    )
  } catch (error) {
    if (!repoAlreadyExists(error)) {
      throw error
    }
    return { repo, url, created: false }
  }
  return { repo, url, created: true }
}
