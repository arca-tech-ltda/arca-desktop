import { describe, expect, it } from 'vitest'
import type { ArcaPriorityProject } from '../../shared/arca-priorities'
import {
  applyLocalHours,
  excludeDefaultPriorityProjects,
  mergePriorityProjects,
  priorityNotifications
} from './priority-data'

function project(overrides: Partial<ArcaPriorityProject> = {}): ArcaPriorityProject {
  return {
    projectId: 'project',
    repoId: 'repo',
    repoKey: 'github.com/arca/repo',
    name: 'Repo',
    path: '/repo',
    statusPath: '/repo/STATUS.md',
    source: 'local',
    title: 'Ship',
    percent: 20,
    done: 1,
    total: 5,
    blocked: [],
    queue: [{ title: 'Next', percent: 0, done: 0, total: 1 }],
    line: 2,
    updatedAt: null,
    completed: false,
    hours7d: null,
    hoursLabel: null,
    startedAt: null,
    recentEvents: [],
    openTasks: [],
    ...overrides
  }
}

describe('priority data', () => {
  it('merges shared data onto a local repo by repo_key', () => {
    const merged = mergePriorityProjects(
      [project({ openTasks: [{ text: 'Open', line: 3 }] })],
      [
        project({
          projectId: 'mainframe',
          repoId: null,
          path: null,
          statusPath: null,
          source: 'shared',
          percent: 60
        })
      ]
    )
    expect(merged[0]).toMatchObject({
      projectId: 'mainframe',
      repoId: 'repo',
      source: 'shared',
      percent: 60,
      openTasks: [{ text: 'Open', line: 3 }]
    })
  })

  it('excludes legacy projects from the priority card even when locally registered', () => {
    expect(
      excludeDefaultPriorityProjects([
        project({ name: 'brain', repoKey: 'github.com/arca-tech-ltda/brain' }),
        project({ name: 'Active', repoKey: 'github.com/arca-tech-ltda/active' })
      ]).map((item) => item.name)
    ).toEqual(['Active'])
  })

  it('uses seven-day local time only when shared hours are absent', () => {
    const result = applyLocalHours(
      [project()],
      [{ repoId: 'repo', displayName: 'Repo', days: { '2026-03-01': 5400 } }],
      new Date(2026, 2, 1)
    )
    expect(result[0]).toMatchObject({ hours7d: 1.5, hoursLabel: 'yours' })
    expect(
      applyLocalHours([project({ hours7d: 8, hoursLabel: 'team' })], [], new Date())[0]?.hours7d
    ).toBe(8)
  })

  it('diffs new blockers and completions with persistent dedupe keys', () => {
    const before = project()
    const after = project({
      completed: true,
      percent: 100,
      done: 5,
      blocked: [{ text: 'Wait (blocked API)', blockedBy: 'API', line: 4 }]
    })
    const notifications = priorityNotifications([before], [after], new Set())
    expect(notifications.map((item) => item.key)).toEqual([
      'blocked:github.com/arca/repo:Wait (blocked API)',
      'completed:github.com/arca/repo:Ship'
    ])
    expect(
      priorityNotifications([before], [after], new Set(notifications.map((item) => item.key)))
    ).toEqual([])
  })

  it('treats queue promotion as completion', () => {
    const next = project({ title: 'Next', queue: [], percent: 0, done: 0, total: 1 })
    expect(priorityNotifications([project()], [next], new Set())[0]?.title).toBe(
      'Prioridade concluída: Ship — próxima: Next'
    )
  })
})
