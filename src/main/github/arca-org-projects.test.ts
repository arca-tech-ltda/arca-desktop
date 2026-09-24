import type * as CatalogModule from '../arca-projects-sync/catalog'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), scan: vi.fn(), stat: vi.fn(), git: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: mocks.stat }))
vi.mock('./gh-utils', () => ({ gitExecFileAsync: mocks.git }))
vi.mock('../arca-projects-sync/catalog', async (original) => ({
  ...(await original<typeof CatalogModule>()),
  loadArcaCatalog: mocks.catalog
}))
vi.mock('../arca-projects-sync/disk', () => ({ scanArcaDisk: mocks.scan }))
import { inspectArcaProjectDestination, listArcaOrgProjects } from './arca-org-projects'

beforeEach(() => {
  vi.resetAllMocks()
})
it('lists outside-org catalog repos and preselects only missing clones', async () => {
  mocks.catalog.mockResolvedValue({
    sources: ['file'],
    errors: [],
    entries: [
      {
        name: 'mcscala',
        repoKey: 'github.com/dkelles/mcscala',
        url: 'https://github.com/dkelles/mcscala.git',
        destination: '/arca/clientes/mcdonalds-escalas'
      },
      {
        name: 'new',
        repoKey: 'github.com/org/new',
        url: 'https://github.com/org/new.git',
        destination: '/arca/produtos/new'
      }
    ]
  })
  mocks.scan.mockResolvedValue([
    { repoKey: 'github.com/dkelles/mcscala', path: '/arca/clientes/mcdonalds-escalas' }
  ])
  mocks.stat.mockImplementation(async (path: string) => {
    if (path.startsWith('/arca/produtos/new')) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
    return { isDirectory: () => true }
  })
  mocks.git.mockResolvedValue({ stdout: 'git@github.com:DKelles/mcScala.git\n' })
  const result = await listArcaOrgProjects()
  expect(result).toMatchObject({
    ok: true,
    projects: [
      { selected: false, diskState: 'arca_repo', destination: '/arca/clientes/mcdonalds-escalas' },
      { selected: true, diskState: 'missing', destination: '/arca/produtos/new' }
    ]
  })
})
it('rejects a destination containing a different repository even within the org', async () => {
  mocks.stat.mockResolvedValue({ isDirectory: () => true })
  mocks.git.mockResolvedValue({ stdout: 'https://github.com/arca-tech-ltda/other' })
  expect(
    await inspectArcaProjectDestination('/repo', 'https://github.com/arca-tech-ltda/wanted')
  ).toMatchObject({ diskState: 'conflict' })
})
it('rejects an existing directory without its own git marker', async () => {
  mocks.stat
    .mockResolvedValueOnce({ isDirectory: () => true })
    .mockRejectedValueOnce(new Error('No marker'))
  expect(
    await inspectArcaProjectDestination('/repo/nested', 'https://github.com/org/repo')
  ).toMatchObject({ diskState: 'conflict' })
  expect(mocks.git).not.toHaveBeenCalled()
})
