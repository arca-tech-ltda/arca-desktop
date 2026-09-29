import { beforeEach, expect, it, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ gh: vi.fn(), git: vi.fn() }))
vi.mock('../git/runner', () => ({
  ghExecFileAsync: mocks.gh,
  gitExecFileAsync: mocks.git,
  nonInteractiveGitEnv: () => ({})
}))
import { openArcaCatalogPullRequest } from './catalog-pull-request'

const CATALOG = `${JSON.stringify(
  {
    version: 1,
    projects: [
      {
        id: 'isaro',
        title: 'Isaro',
        repos: [{ url: 'https://github.com/arca-tech-ltda/isaro.git', path: 'clientes/isaro' }]
      }
    ]
  },
  null,
  2
)}\n`

const WORKSPACE_TEST = 'assert.deepEqual(ids, ["isaro"]);\n'

let checkout = ''
const committed: Record<string, string> = {}
const ghArgs: string[][] = []
const gitRuns: { args: string[]; cwd: string }[] = []

async function seedCheckout(target: string): Promise<void> {
  checkout = target
  await mkdir(path.join(checkout, 'test'), { recursive: true })
  await writeFile(path.join(checkout, 'projects.json'), CATALOG, 'utf8')
  await writeFile(path.join(checkout, 'test', 'arca_workspace.test.ts'), WORKSPACE_TEST, 'utf8')
}

beforeEach(() => {
  vi.resetAllMocks()
  checkout = ''
  ghArgs.length = 0
  gitRuns.length = 0
  for (const key of Object.keys(committed)) {
    delete committed[key]
  }
  mocks.gh.mockImplementation(async (args: string[]) => {
    ghArgs.push(args)
    if (args[0] === 'repo' && args[1] === 'clone') {
      await seedCheckout(args[3])
      return { stdout: '', stderr: '' }
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      return { stdout: 'https://github.com/arca-tech-ltda/arca/pull/14\n', stderr: '' }
    }
    return { stdout: '', stderr: '' }
  })
  mocks.git.mockImplementation(async (args: string[], options: { cwd: string }) => {
    gitRuns.push({ args, cwd: options.cwd })
    if (args[0] === 'commit') {
      committed['projects.json'] = await readFile(path.join(checkout, 'projects.json'), 'utf8')
      committed['test'] = await readFile(
        path.join(checkout, 'test', 'arca_workspace.test.ts'),
        'utf8'
      )
    }
    return { stdout: '', stderr: '' }
  })
})

const input = {
  id: 'radar',
  title: 'Radar',
  name: 'radar',
  type: 'clientes' as const,
  description: 'Radar de licitações'
}

it('edits both files in a throwaway clone and merges the pull request', async () => {
  const result = await openArcaCatalogPullRequest(input, '/home/ana')
  expect(result).toEqual({ url: 'https://github.com/arca-tech-ltda/arca/pull/14', merged: true })
  const catalog: { projects: { id: string }[] } = JSON.parse(committed['projects.json'])
  expect(catalog.projects.map((project) => project.id)).toEqual(['isaro', 'radar'])
  expect(committed['test']).toContain('assert.deepEqual(ids, ["isaro", "radar"]);')
  const gitArgs = gitRuns.map((run) => run.args.join(' '))
  expect(gitArgs).toContain('checkout -B chore/catalog-radar')
  expect(gitArgs.some((args) => args.startsWith('push'))).toBe(true)
  expect(ghArgs.some((args) => args[0] === 'pr' && args[1] === 'merge')).toBe(true)
  // The user's own ~/ARCA/arca is only ever read and fast-forwarded.
  expect(
    gitRuns
      .filter((run) => run.cwd.includes('/ARCA/arca'))
      .every((run) => ['status', 'pull'].includes(run.args[0]))
  ).toBe(true)
})

it('leaves the pull request open when the merge is refused', async () => {
  mocks.gh.mockImplementation(async (args: string[]) => {
    if (args[0] === 'repo' && args[1] === 'clone') {
      await seedCheckout(args[3])
      return { stdout: '', stderr: '' }
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      return { stdout: 'https://github.com/arca-tech-ltda/arca/pull/15\n', stderr: '' }
    }
    if (args[0] === 'pr' && args[1] === 'merge') {
      throw new Error('GraphQL: Resource not accessible by integration')
    }
    return { stdout: '', stderr: '' }
  })
  const result = await openArcaCatalogPullRequest(input, '/home/ana')
  expect(result.merged).toBe(false)
  expect(result.url).toBe('https://github.com/arca-tech-ltda/arca/pull/15')
  expect(result.mergeError).toContain('not accessible')
})

it('reuses the pull request already open for the branch', async () => {
  mocks.gh.mockImplementation(async (args: string[]) => {
    if (args[0] === 'repo' && args[1] === 'clone') {
      await seedCheckout(args[3])
      return { stdout: '', stderr: '' }
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      throw new Error('a pull request for branch already exists')
    }
    if (args[0] === 'pr' && args[1] === 'list') {
      return {
        stdout: JSON.stringify([{ url: 'https://github.com/arca-tech-ltda/arca/pull/9' }]),
        stderr: ''
      }
    }
    return { stdout: '', stderr: '' }
  })
  const result = await openArcaCatalogPullRequest(input, '/home/ana')
  expect(result.url).toBe('https://github.com/arca-tech-ltda/arca/pull/9')
})
