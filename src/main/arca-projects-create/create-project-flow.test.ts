import { beforeEach, expect, it, vi } from 'vitest'
import { runArcaProjectCreation, type ArcaCreationDependencies } from './create-project-flow'
import type { ArcaCreationStep } from '../../shared/arca-project-creation'

function dependencies(overrides: Partial<ArcaCreationDependencies> = {}): {
  deps: ArcaCreationDependencies
  calls: string[]
  seeded: Record<string, string>
} {
  const calls: string[] = []
  const seeded: Record<string, string> = {}
  const deps: ArcaCreationDependencies = {
    home: '/home/ana',
    ensureRepository: async ({ name }) => {
      calls.push('ensureRepository')
      return {
        repo: `arca-tech-ltda/${name}`,
        url: `https://github.com/arca-tech-ltda/${name}.git`,
        created: true
      }
    },
    cloneRepository: async ({ destination }) => {
      calls.push(`clone:${destination}`)
    },
    writeSeedFiles: async (_destination, files) => {
      calls.push(`seed:${Object.keys(files).join(',')}`)
      Object.assign(seeded, files)
    },
    commitAndPush: async () => {
      calls.push('commitAndPush')
    },
    publishLocalFolder: async ({ sourcePath }) => {
      calls.push(`publish:${sourcePath}`)
      return { remoteName: 'arca', branch: 'main', initialized: true }
    },
    moveFolder: async (source, destination) => {
      calls.push(`move:${source}->${destination}`)
    },
    registerProject: async (directory) => {
      calls.push(`register:${directory}`)
      return 'repo-1'
    },
    openCatalogPullRequest: async () => {
      calls.push('catalogPr')
      return { url: 'https://github.com/arca-tech-ltda/arca/pull/14', merged: true }
    },
    ...overrides
  }
  return { deps, calls, seeded }
}

function stateOf(steps: ArcaCreationStep[], id: string): string | undefined {
  return steps.find((step) => step.id === id)?.state
}

beforeEach(() => {
  vi.useRealTimers()
})

it('creates, seeds, registers and catalogs a new project', async () => {
  const { deps, calls, seeded } = dependencies()
  const progress: ArcaCreationStep[][] = []
  const result = await runArcaProjectCreation(
    { name: 'radar', type: 'clientes', description: 'Radar de licitações' },
    deps,
    (steps) => progress.push(steps)
  )
  expect(result.ok).toBe(true)
  expect(calls).toEqual([
    'ensureRepository',
    'clone:/home/ana/ARCA/clientes/radar',
    'seed:README.md,STATUS.md',
    'commitAndPush',
    'register:/home/ana/ARCA/clientes/radar',
    'catalogPr'
  ])
  expect(seeded['STATUS.md']).toContain('# STATUS — radar')
  expect(seeded['README.md']).toContain('Radar de licitações')
  expect(result.pullRequestUrl).toBe('https://github.com/arca-tech-ltda/arca/pull/14')
  expect(result.merged).toBe(true)
  expect(stateOf(result.steps, 'mainframe')).toBe('skipped')
  expect(progress.length).toBeGreaterThan(0)
})

it('publishes an existing folder without moving it by default', async () => {
  const { deps, calls } = dependencies()
  const result = await runArcaProjectCreation(
    {
      name: 'estudos',
      type: 'interno',
      description: 'Notas',
      sourcePath: '/home/ana/code/estudos'
    },
    deps,
    () => {}
  )
  expect(result.ok).toBe(true)
  expect(calls).toEqual([
    'ensureRepository',
    'publish:/home/ana/code/estudos',
    'register:/home/ana/code/estudos',
    'catalogPr'
  ])
  expect(result.destination).toBe('/home/ana/code/estudos')
})

it('moves the folder under ~/ARCA only when asked', async () => {
  const { deps, calls } = dependencies()
  const result = await runArcaProjectCreation(
    {
      name: 'estudos',
      type: 'produtos',
      description: 'Notas',
      sourcePath: '/home/ana/code/estudos',
      moveToArcaRoot: true
    },
    deps,
    () => {}
  )
  expect(calls).toContain('move:/home/ana/code/estudos->/home/ana/ARCA/produtos/estudos')
  expect(calls).toContain('register:/home/ana/ARCA/produtos/estudos')
  expect(result.destination).toBe('/home/ana/ARCA/produtos/estudos')
})

it('reports what is done and keeps the repository when the catalog PR fails', async () => {
  const { deps, calls } = dependencies({
    openCatalogPullRequest: async () => {
      throw new Error('gh: no write access')
    }
  })
  const result = await runArcaProjectCreation(
    { name: 'radar', type: 'clientes', description: '' },
    deps,
    () => {}
  )
  expect(result.ok).toBe(false)
  expect(result.error).toContain('no write access')
  expect(result.repoUrl).toBe('https://github.com/arca-tech-ltda/radar.git')
  expect(result.resume).toContain('createRepo')
  expect(result.resume).toContain('foi mantido')
  expect(stateOf(result.steps, 'catalogPr')).toBe('failed')
  expect(stateOf(result.steps, 'register')).toBe('done')
  expect(calls).not.toContain('delete')
})

it('stops before registering when the push fails', async () => {
  const { deps, calls } = dependencies({
    commitAndPush: async () => {
      throw new Error('remote rejected')
    }
  })
  const result = await runArcaProjectCreation(
    { name: 'radar', type: 'clientes', description: '' },
    deps,
    () => {}
  )
  expect(result.ok).toBe(false)
  expect(stateOf(result.steps, 'seedRepo')).toBe('failed')
  expect(stateOf(result.steps, 'register')).toBe('pending')
  expect(calls).not.toContain('catalogPr')
})
