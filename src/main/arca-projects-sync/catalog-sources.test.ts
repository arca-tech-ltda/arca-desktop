import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), tool: vi.fn(), gh: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }))
vi.mock('../arca-megamind/credentials', () => ({
  object: (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value),
  readCredential: async () => ({}),
  megamindConfigPath: () => '/config'
}))
vi.mock('../arca-megamind/gateway', () => ({ callTool: mocks.tool }))
vi.mock('../git/runner', () => ({ ghExecFileAsync: mocks.gh }))
import { loadArcaCatalog } from './catalog'
import { resetArcaOrgDiscoveryCache } from './github-org-discovery'
beforeEach(() => {
  vi.resetAllMocks()
  resetArcaOrgDiscoveryCache()
})
it('paginates Mainframe and unions the file without requiring git pull', async () => {
  mocks.tool
    .mockResolvedValueOnce({
      items: [{ repos: ['github.com/arca-tech-ltda/new'] }],
      next_cursor: 'new'
    })
    .mockResolvedValueOnce({
      items: [{ repos: ['github.com/DKelles/mcScala'] }],
      next_cursor: null
    })
  mocks.read.mockResolvedValue(
    JSON.stringify({
      projects: [
        {
          repos: [{ url: 'git@github.com:DKelles/mcScala.git', path: 'clientes/mcdonalds-escalas' }]
        }
      ]
    })
  )
  mocks.gh.mockResolvedValue({
    stdout: JSON.stringify([{ url: 'https://github.com/arca-tech-ltda/legacy' }])
  })
  const result = await loadArcaCatalog('/home/ana')
  expect(result.entries.map((entry) => entry.name)).toEqual(['new', 'mcscala', 'legacy'])
  expect(result.sources).toEqual(['mainframe', 'file', 'github'])
  expect(mocks.tool.mock.calls[1][3]).toEqual({ limit: 100, cursor: 'new' })
  expect(result.entries[1].destination).toBe('/home/ana/ARCA/clientes/mcdonalds-escalas')
})
it('uses the file even when Mainframe and GitHub are unavailable', async () => {
  mocks.tool.mockRejectedValue(new Error('offline'))
  mocks.gh.mockRejectedValue(new Error('no gh'))
  mocks.read.mockResolvedValue(
    JSON.stringify({ projects: [{ repos: ['github.com/DKelles/mcScala'] }] })
  )
  const result = await loadArcaCatalog('/home/ana')
  expect(result.sources).toEqual(['file'])
  expect(result.entries[0].repoKey).toBe('github.com/dkelles/mcscala')
  expect(result.errors).toHaveLength(1)
})

it('bounds discovery to one paginated call and caches it for ten minutes', async () => {
  vi.useFakeTimers()
  try {
    mocks.tool.mockRejectedValue(new Error('offline'))
    mocks.read.mockRejectedValue(new Error('missing'))
    mocks.gh.mockRejectedValue(new Error('timeout'))
    await Promise.all([loadArcaCatalog('/a'), loadArcaCatalog('/b')])
    expect(mocks.gh).toHaveBeenCalledTimes(1)
    expect(mocks.gh).toHaveBeenCalledWith(expect.arrayContaining(['--limit', '200']), {
      timeout: 10_000
    })
    await loadArcaCatalog('/a')
    expect(mocks.gh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10 * 60_000)
    await loadArcaCatalog('/a')
    expect(mocks.gh).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

it('offers an org repository the catalogs never listed', async () => {
  mocks.tool.mockResolvedValue({ items: [], next_cursor: null })
  mocks.read.mockResolvedValue(
    JSON.stringify({
      projects: [{ id: 'isaro', repos: [{ url: 'https://github.com/arca-tech-ltda/isaro.git' }] }]
    })
  )
  mocks.gh.mockResolvedValue({
    stdout: JSON.stringify([
      { url: 'https://github.com/arca-tech-ltda/riva-radar-licitacoes', description: 'Radar' }
    ])
  })
  const result = await loadArcaCatalog('/home/ana')
  const discovered = result.entries.find((entry) => entry.name === 'riva-radar-licitacoes')
  expect(discovered).toMatchObject({
    source: 'github',
    description: 'Radar',
    destination: '/home/ana/ARCA/clientes/riva-radar-licitacoes'
  })
})

it('keeps the catalog path and title when the org also reports the repository', async () => {
  mocks.tool.mockRejectedValue(new Error('offline'))
  mocks.read.mockResolvedValue(
    JSON.stringify({
      projects: [
        {
          id: 'wgs',
          title: 'WGS — Controles de frota',
          repos: [
            {
              url: 'https://github.com/arca-tech-ltda/wgs-sistema.git',
              path: 'clientes/wgs-sistema'
            }
          ]
        }
      ]
    })
  )
  mocks.gh.mockResolvedValue({
    stdout: JSON.stringify([
      { url: 'https://github.com/arca-tech-ltda/wgs-sistema', description: 'from github' }
    ])
  })
  const result = await loadArcaCatalog('/home/ana')
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]).toMatchObject({
    source: 'file',
    title: 'WGS — Controles de frota',
    destination: '/home/ana/ARCA/clientes/wgs-sistema'
  })
})

it('marks a repository archived on GitHub even when the catalog still lists it', async () => {
  mocks.tool.mockRejectedValue(new Error('offline'))
  mocks.read.mockResolvedValue(
    JSON.stringify({
      projects: [{ id: 'old', repos: [{ url: 'https://github.com/arca-tech-ltda/old.git' }] }]
    })
  )
  mocks.gh.mockResolvedValue({
    stdout: JSON.stringify([{ url: 'https://github.com/arca-tech-ltda/old', isArchived: true }])
  })
  const result = await loadArcaCatalog('/home/ana')
  expect(result.entries[0].archived).toBe(true)
})
