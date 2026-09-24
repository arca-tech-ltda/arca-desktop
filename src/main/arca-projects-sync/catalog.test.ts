import { describe, expect, it } from 'vitest'
import { catalogDestination, normalizeArcaRemote, parseCatalog, unionCatalogs } from './catalog'

describe('ARCA catalog', () => {
  it.each([
    'https://GitHub.com/DKelles/mcScala.git',
    'git@github.com:DKelles/mcScala.git',
    'ssh://git@github.com/DKelles/mcScala',
    'github.com/DKelles/mcScala'
  ])('normalizes %s', (remote) => {
    expect(normalizeArcaRemote(remote)).toBe('github.com/dkelles/mcscala')
  })
  it('unions identities, preserves external repos and file layout', () => {
    const mainframe = parseCatalog(
      { items: [{ repos: ['github.com/DKelles/mcScala'] }] },
      'mainframe',
      '/home/ana'
    )
    const file = parseCatalog(
      {
        projects: [
          {
            pending_transfer: true,
            repos: [
              { url: 'git@github.com:DKelles/mcScala.git', path: 'clientes/mcdonalds-escalas' },
              { url: 'https://github.com/other/mcScala' }
            ]
          }
        ]
      },
      'file',
      '/home/ana'
    )
    expect(unionCatalogs(mainframe, file)).toEqual([
      expect.objectContaining({
        source: 'mainframe',
        destination: '/home/ana/ARCA/clientes/mcdonalds-escalas'
      }),
      expect.objectContaining({ repoKey: 'github.com/other/mcscala' })
    ])
  })
  it('resolves Windows destinations and rejects escaping paths', () => {
    expect(catalogDestination('C:\\Users\\Ana', 'clientes/mcScala')).toBe(
      'C:\\Users\\Ana\\ARCA\\clientes\\mcScala'
    )
    expect(() => catalogDestination('C:\\Users\\Ana', '..\\elsewhere')).toThrow()
    expect(() => catalogDestination('/home/ana', '/tmp/elsewhere')).toThrow()
  })
})
it('prefers an explicit Mainframe layout over the older local file', () => {
  const mainframe = parseCatalog(
    { items: [{ repos: [{ repo_key: 'github.com/org/repo', path: 'produtos/repo' }] }] },
    'mainframe',
    '/home/ana'
  )
  const file = parseCatalog(
    { projects: [{ repos: [{ url: 'https://github.com/org/repo.git', path: 'clientes/repo' }] }] },
    'file',
    '/home/ana'
  )
  expect(unionCatalogs(mainframe, file)[0].destination).toBe('/home/ana/ARCA/produtos/repo')
})
