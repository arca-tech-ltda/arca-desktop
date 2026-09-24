import { describe, expect, it } from 'vitest'
import { parseArcaPriority, sortArcaPriorities, type ArcaPriorityProject } from './arca-priorities'

describe('parseArcaPriority', () => {
  it('returns no priority without a matching heading', () => {
    expect(parseArcaPriority('# Project\n- [ ] Task').title).toBeNull()
  })

  it('counts tasks, nested subsections, and ignores fenced checkboxes', () => {
    const result = parseArcaPriority(`## Prioridade: Entregar escalas
- [x] Feita
### Parte
- [ ] Aberta
\`\`\`
## Priority: Exemplo
- [ ] Exemplo
\`\`\`
- [ ] Outra`)
    expect(result).toMatchObject({
      title: 'Entregar escalas',
      done: 1,
      total: 3,
      percent: 33,
      line: 1
    })
  })

  it('extracts blockers from open tasks', () => {
    expect(
      parseArcaPriority('## Priority: Cobrança\n- [ ] Banco dos boletos (bloq. WGS)').blocked
    ).toEqual([{ text: 'Banco dos boletos (bloq. WGS)', blockedBy: 'WGS', line: 2 }])
  })

  it('parses the queue in file order and completion', () => {
    const result = parseArcaPriority(`## PRIORIDADE — **Ação**
- [X] Feita
## Próximo: X
- [ ] Uma
## Next: Y
- [x] Duas`)
    expect(result).toMatchObject({ title: 'Ação', completed: true, percent: 100 })
    expect(result.queue).toEqual([
      { title: 'X', percent: 0, done: 0, total: 1 },
      { title: 'Y', percent: 100, done: 1, total: 1 }
    ])
  })
})

function project(name: string, percent: number, blocked = false): ArcaPriorityProject {
  return {
    projectId: name,
    repoId: name,
    repoKey: null,
    name,
    path: null,
    statusPath: null,
    source: 'local',
    title: name,
    percent,
    done: percent,
    total: 100,
    blocked: blocked ? [{ text: 'blocked', blockedBy: 'x', line: 2 }] : [],
    queue: [],
    line: 1,
    updatedAt: null,
    completed: percent === 100,
    hours7d: null,
    hoursLabel: null,
    startedAt: null,
    recentEvents: [],
    openTasks: []
  }
}

describe('sortArcaPriorities', () => {
  it('sorts blocked projects first, then by lowest progress', () => {
    expect(
      sortArcaPriorities([
        project('half', 50),
        project('low', 10),
        project('blocked', 80, true)
      ]).map((item) => item.name)
    ).toEqual(['blocked', 'low', 'half'])
  })
})
