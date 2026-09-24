import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ArcaGitHubRepository } from '../../shared/arca-projects-types'
import { reconcileArcaProjects } from './arca-org-projects'

function repository(name: string, isArchived = false): ArcaGitHubRepository {
  return {
    name,
    description: null,
    isArchived,
    url: `https://github.com/arca-tech-ltda/${name}`,
    sshUrl: `git@github.com:arca-tech-ltda/${name}.git`,
    pushedAt: '2026-01-01T00:00:00Z'
  }
}

describe('reconcileArcaProjects', () => {
  it('uses catalog destinations and suggests clientes for uncatalogued repositories', () => {
    const home = path.resolve('/home/ana')
    const result = reconcileArcaProjects({
      repositories: [repository('arca'), repository('new-client')],
      catalog: {
        root_default: '~/ARCA',
        projects: [{ repos: [{ repo_id: 'github.com/arca-tech-ltda/arca', path: 'arca' }] }]
      },
      home,
      inspections: {}
    })

    expect(
      result.projects.map(({ name, destination, catalogued, selected }) => ({
        name,
        destination,
        catalogued,
        selected
      }))
    ).toEqual([
      {
        name: 'arca',
        destination: path.join(home, 'ARCA', 'arca'),
        catalogued: true,
        selected: true
      },
      {
        name: 'new-client',
        destination: path.join(home, 'ARCA', 'clientes', 'new-client'),
        catalogued: false,
        selected: false
      }
    ])
  })

  it('hides archived repositories and brain by default', () => {
    const result = reconcileArcaProjects({
      repositories: [repository('brain'), repository('old', true), repository('active')],
      catalog: {},
      home: '/home/ana',
      inspections: {}
    })
    expect(result.projects.map((project) => project.name)).toEqual(['active'])
    expect(result.hiddenCount).toBe(2)
  })

  it('preselects an ARCA repository already on disk and preserves remote conflicts', () => {
    const home = '/home/ana'
    const existing = path.join(home, 'ARCA', 'clientes', 'existing')
    const conflict = path.join(home, 'ARCA', 'clientes', 'conflict')
    const result = reconcileArcaProjects({
      repositories: [repository('existing'), repository('conflict')],
      catalog: {},
      home,
      inspections: {
        [existing]: { diskState: 'arca_repo' },
        [conflict]: { diskState: 'conflict', diskError: 'different remote' }
      }
    })
    expect(result.projects[0]).toMatchObject({ selected: true, diskState: 'arca_repo' })
    expect(result.projects[1]).toMatchObject({
      selected: false,
      diskState: 'conflict',
      diskError: 'different remote'
    })
  })
})
