import { describe, expect, it } from 'vitest'
import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import { parseStatusMd } from '../../../../shared/status-md-tasks'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { selectCurrentStatusProject, selectProjectCardTasks } from './priority-card-data'

function project(repoId: string): StatusMdTaskProject {
  return {
    repoId,
    name: repoId,
    path: `/repos/${repoId}`,
    statusPath: `/repos/${repoId}/STATUS.md`,
    status: 'available',
    tasks: parseStatusMd('# First\n- [ ] One\n- [x] Done\n# Second\n- [ ] Two', repoId).tasks,
    updatedAt: null
  }
}

describe('priority card data', () => {
  it('selects the project owned by the active worktree', () => {
    const projects = [project('one'), project('two')]
    expect(selectCurrentStatusProject(projects, { repoId: 'two' })?.repoId).toBe('two')
    expect(selectCurrentStatusProject(projects, null)).toBeNull()
    expect(selectCurrentStatusProject(projects, { repoId: 'folder-workspace:group' })).toBeNull()
  })

  it('falls back to the first open tasks in file order when no priority exists', () => {
    expect(selectProjectCardTasks(project('one'), null).map((task) => task.title)).toEqual([
      'One',
      'Two'
    ])
  })

  it('limits a defined priority to its section task lines', () => {
    const priority: ArcaPriorityProject = {
      projectId: 'one',
      repoId: 'one',
      repoKey: null,
      name: 'one',
      path: '/repos/one',
      statusPath: '/repos/one/STATUS.md',
      source: 'local',
      title: 'Second',
      percent: 0,
      done: 0,
      total: 1,
      blocked: [],
      queue: [],
      line: 4,
      updatedAt: null,
      completed: false,
      openTasks: [{ text: 'Two', line: 5 }],
      hours7d: null,
      hoursLabel: null,
      startedAt: null,
      recentEvents: []
    }
    expect(selectProjectCardTasks(project('one'), priority).map((task) => task.title)).toEqual([
      'Two'
    ])
  })
})
