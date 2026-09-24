import { describe, expect, it } from 'vitest'
import { readStatusMdTasksForRepos, recentStatusMdTasks } from './status-md-tasks'
import { parseStatusMd } from '../../shared/status-md-tasks'
import type { Repo } from '../../shared/repo-types'

const repo: Repo = {
  id: 'repo-1',
  path: '/projects/example',
  displayName: 'Example',
  badgeColor: 'blue',
  addedAt: 1
}

describe('readStatusMdTasksForRepos', () => {
  it('reports a missing STATUS.md without failing the project list', async () => {
    const result = await readStatusMdTasksForRepos([repo], async () => {
      const error = new Error('missing')
      Object.assign(error, { code: 'ENOENT' })
      throw error
    })

    expect(result).toEqual([
      {
        repoId: 'repo-1',
        name: 'Example',
        path: '/projects/example',
        statusPath: '/projects/example/STATUS.md',
        status: 'missing',
        tasks: [],
        updatedAt: null
      }
    ])
  })

  it('does not try to read remote repositories locally', async () => {
    const remote = { ...repo, connectionId: 'ssh-1' }
    const read = async (): Promise<string> => {
      throw new Error('should not read')
    }
    await expect(readStatusMdTasksForRepos([remote], read)).resolves.toMatchObject([
      { status: 'unavailable', tasks: [] }
    ])
  })

  it('orders open and completed tasks by their blamed line timestamps', async () => {
    const tasks = parseStatusMd('- [ ] Older\n- [x] Recently done\n- [ ] Newest', repo.id).tasks
    const projects = [
      {
        repoId: repo.id,
        name: repo.displayName,
        path: repo.path,
        statusPath: `${repo.path}/STATUS.md`,
        status: 'available' as const,
        tasks,
        updatedAt: null
      }
    ]
    const result = await recentStatusMdTasks(
      projects,
      async () =>
        new Map([
          [1, 100],
          [2, 300],
          [3, 400]
        ])
    )

    expect(result.open.map((item) => item.task.title)).toEqual(['Newest', 'Older'])
    expect(result.completed.map((item) => item.task.title)).toEqual(['Recently done'])
  })
})
