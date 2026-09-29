import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { ghExecFileAsync, gitExecFileAsync, nonInteractiveGitEnv } from '../git/runner'
import { ARCA_CATALOG_REPO, type ArcaProjectType } from '../../shared/arca-project-creation'
import {
  addProjectToCatalogJson,
  catalogProjectIds,
  updateWorkspaceTestIds
} from './catalog-file-edit'

const CLONE_TIMEOUT_MS = 120_000
const GIT_TIMEOUT_MS = 60_000
const GH_TIMEOUT_MS = 60_000
const CATALOG_FILE = 'projects.json'
const WORKSPACE_TEST_FILE = path.posix.join('test', 'arca_workspace.test.ts')

export type ArcaCatalogPullRequest = {
  url: string
  merged: boolean
  mergeError?: string
}

export type CatalogPullRequestInput = {
  id: string
  title: string
  name: string
  type: ArcaProjectType
  description: string
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await gitExecFileAsync(args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    env: nonInteractiveGitEnv()
  })
  return stdout.trim()
}

async function applyCatalogEdits(checkout: string, input: CatalogPullRequestInput): Promise<void> {
  const catalogPath = path.join(checkout, CATALOG_FILE)
  const updated = addProjectToCatalogJson(await readFile(catalogPath, 'utf8'), {
    id: input.id,
    title: input.title,
    type: input.type,
    name: input.name
  })
  await writeFile(catalogPath, updated, 'utf8')
  const testPath = path.join(checkout, WORKSPACE_TEST_FILE)
  const testSource = await readFile(testPath, 'utf8')
  await writeFile(testPath, updateWorkspaceTestIds(testSource, catalogProjectIds(updated)), 'utf8')
}

async function existingPullRequestUrl(branch: string): Promise<string | undefined> {
  const { stdout } = await ghExecFileAsync(
    ['pr', 'list', '--repo', ARCA_CATALOG_REPO, '--head', branch, '--json', 'url', '--limit', '1'],
    { timeout: GH_TIMEOUT_MS }
  )
  const parsed: unknown = JSON.parse(stdout)
  const first = Array.isArray(parsed) ? parsed[0] : undefined
  return typeof first === 'object' &&
    first !== null &&
    'url' in first &&
    typeof first.url === 'string'
    ? first.url
    : undefined
}

async function openPullRequest(branch: string, input: CatalogPullRequestInput): Promise<string> {
  const body = [
    `Adiciona **${input.title}** ao catálogo da ARCA.`,
    '',
    `- \`${CATALOG_FILE}\`: novo projeto \`${input.id}\` em \`${input.type}/${input.name}\`.`,
    `- \`${WORKSPACE_TEST_FILE}\`: lista de ids atualizada.`,
    '',
    input.description.trim(),
    '',
    'Aberto pelo ARCA Desktop.'
  ].join('\n')
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'pr',
        'create',
        '--repo',
        ARCA_CATALOG_REPO,
        '--head',
        branch,
        '--title',
        `Catálogo: adiciona ${input.title}`,
        '--body',
        body
      ],
      { timeout: GH_TIMEOUT_MS, idempotent: false }
    )
    const url = stdout
      .trim()
      .split(/\s+/)
      .find((line) => line.startsWith('http'))
    return url ?? (await existingPullRequestUrl(branch)) ?? stdout.trim()
  } catch (error) {
    const existing = await existingPullRequestUrl(branch).catch(() => undefined)
    if (existing) {
      return existing
    }
    throw error
  }
}

async function mergePullRequest(url: string): Promise<{ merged: boolean; mergeError?: string }> {
  try {
    await ghExecFileAsync(
      ['pr', 'merge', url, '--repo', ARCA_CATALOG_REPO, '--squash', '--delete-branch'],
      {
        timeout: GH_TIMEOUT_MS,
        idempotent: false
      }
    )
    return { merged: true }
  } catch (error) {
    // No write access, required checks, or protected branch: the PR stays open on purpose.
    return { merged: false, mergeError: String(error) }
  }
}

/** Best effort: the user's own ~/ARCA/arca checkout is never edited, only fast-forwarded. */
async function pullLocalCatalog(home: string): Promise<void> {
  const local = path.join(home, 'ARCA', 'arca')
  try {
    if (await git(local, ['status', '--porcelain'])) {
      return
    }
    await git(local, ['pull', '--ff-only'])
  } catch {
    /* The local copy is optional; the app reads the catalog from GitHub too. */
  }
}

/**
 * Adds the project to `arca`'s projects.json through a branch and a PR, from a throwaway
 * clone — the user's ~/ARCA/arca working copy is never touched except for a final pull.
 */
export async function openArcaCatalogPullRequest(
  input: CatalogPullRequestInput,
  home = homedir()
): Promise<ArcaCatalogPullRequest> {
  const checkout = await mkdtemp(path.join(tmpdir(), 'arca-catalog-'))
  const branch = `chore/catalog-${input.name}`
  try {
    await ghExecFileAsync(['repo', 'clone', ARCA_CATALOG_REPO, checkout, '--', '--depth', '1'], {
      timeout: CLONE_TIMEOUT_MS
    })
    await git(checkout, ['checkout', '-B', branch])
    await applyCatalogEdits(checkout, input)
    await git(checkout, ['add', CATALOG_FILE, WORKSPACE_TEST_FILE])
    await git(checkout, ['commit', '-m', `Catálogo: adiciona ${input.title}`])
    await git(checkout, ['push', '--force-with-lease', '-u', 'origin', branch])
    const url = await openPullRequest(branch, input)
    const merged = await mergePullRequest(url)
    if (merged.merged) {
      await pullLocalCatalog(home)
    }
    return { url, ...merged }
  } finally {
    await rm(checkout, { recursive: true, force: true }).catch(() => {})
  }
}
