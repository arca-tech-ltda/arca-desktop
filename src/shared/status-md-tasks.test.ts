import { describe, expect, it } from 'vitest'
import {
  filterStatusMdTasks,
  groupStatusMdTasksBySection,
  parseStatusMd
} from './status-md-tasks'

describe('parseStatusMd', () => {
  it('parses checkbox variants, sections, indentation, formatting and updated date', () => {
    const result = parseStatusMd(
      [
        '# **Now**',
        '> atualizado: 2025-02-03',
        '- [ ] **Ship** the `parser` [docs](https://example.test)',
        '  * [X] Done item',
        '+ [x] Also done',
        '### Later ###',
        '    - [ ] Nested'
      ].join('\n'),
      'repo-1'
    )

    expect(result.updatedAt).toBe('2025-02-03')
    expect(result.tasks).toMatchObject([
      { title: 'Ship the parser docs', rawText: '**Ship** the `parser` [docs](https://example.test)', completed: false, depth: 0, section: 'Now', lineNumber: 3 },
      { title: 'Done item', completed: true, depth: 1, section: 'Now', lineNumber: 4 },
      { title: 'Also done', completed: true, depth: 0, section: 'Now', lineNumber: 5 },
      { title: 'Nested', completed: false, depth: 2, section: 'Later', lineNumber: 7 }
    ])
  })

  it('ignores fenced markdown and keeps ids stable', () => {
    const markdown = ['```md', '- [ ] ignored', '```', '- [ ] keep'].join('\n')
    const first = parseStatusMd(markdown, 'repo-1')
    const second = parseStatusMd(markdown, 'repo-1')

    expect(first.tasks).toHaveLength(1)
    expect(first.tasks[0]?.id).toBe(second.tasks[0]?.id)
    expect(first.tasks[0]?.id).toMatch(/^repo-1:4:[0-9a-f]{8}$/)
  })

  it('supports tilde fences and caps output at 1000 items', () => {
    const markdown = ['~~~', '- [ ] ignored', '~~~', ...Array.from({ length: 1001 }, (_, i) => `- [ ] task ${i}`)].join('\n')
    const result = parseStatusMd(markdown)
    expect(result.tasks).toHaveLength(1000)
    expect(result.tasks[0]?.title).toBe('task 0')
  })
})

describe('status markdown task projections', () => {
  const tasks = parseStatusMd('# A\n- [ ] open\n- [x] closed\n# B\n- [ ] other', 'r').tasks

  it('groups adjacent sections and filters by status and search', () => {
    expect(groupStatusMdTasksBySection(tasks).map((group) => group.section)).toEqual(['A', 'B'])
    expect(filterStatusMdTasks(tasks, 'open').map((task) => task.title)).toEqual(['open', 'other'])
    expect(filterStatusMdTasks(tasks, 'completed').map((task) => task.title)).toEqual(['closed'])
    expect(filterStatusMdTasks(tasks, 'all', 'other').map((task) => task.title)).toEqual(['other'])
  })
})
