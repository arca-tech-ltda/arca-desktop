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
beforeEach(() => {
  vi.resetAllMocks()
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
  expect(result.entries).toHaveLength(2)
  expect(result.sources).toEqual(['mainframe', 'file'])
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
  expect(mocks.gh).not.toHaveBeenCalled()
})

it('bounds fallback discovery and caches failures for ten minutes', async () => {
  vi.useFakeTimers()
  try {
    mocks.tool.mockRejectedValue(new Error('offline'))
    mocks.read.mockRejectedValue(new Error('missing'))
    mocks.gh.mockRejectedValue(new Error('timeout'))
    await Promise.all([loadArcaCatalog('/a'), loadArcaCatalog('/b')])
    expect(mocks.gh).toHaveBeenCalledTimes(1)
    expect(mocks.gh).toHaveBeenCalledWith(expect.arrayContaining(['--limit', '100']), {
      timeout: 5000
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
