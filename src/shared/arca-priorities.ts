export type ArcaPriorityBlockedTask = {
  text: string
  blockedBy: string
  line: number
}

export type ArcaPriorityQueueItem = {
  title: string
  percent: number | null
  done: number
  total: number
}

export type ParsedArcaPriority = {
  title: string | null
  percent: number | null
  done: number
  total: number
  blocked: ArcaPriorityBlockedTask[]
  queue: ArcaPriorityQueueItem[]
  line: number | null
  updatedAt: string | null
  completed: boolean
  openTasks: ArcaPriorityOpenTask[]
}

export type ArcaPrioritySource = 'shared' | 'local'

export type ArcaPriorityOpenTask = { text: string; line: number }

export type ArcaPriorityProject = ParsedArcaPriority & {
  projectId: string
  repoId: string | null
  repoKey: string | null
  name: string
  path: string | null
  statusPath: string | null
  source: ArcaPrioritySource
  hours7d: number | null
  hoursLabel: 'team' | 'yours' | null
  startedAt: string | null
  recentEvents: unknown[]
  openTasks: ArcaPriorityOpenTask[]
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const PRIORITY = /^(prioridade atual|prioridade|priority)\s*[:\-—–]\s*(.+?)\s*$/i
const QUEUE = /^(próxima prioridade|próximas?|próximos?|proxim[ao]s?|next)\s*[:\-—–]\s*(.+?)\s*$/i
const TASK = /^\s*[-*+]\s+\[([ xX])]\s+(.+)$/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const UPDATED = /^\s*>\s*atualizado\s*:\s*(.+?)\s*$/i
const BLOCKED = /\((bloq\.?|bloqueado|bloqueada|blocked)\b([^)]*)\)/i

function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .trim()
}

type Section = { title: string; level: number; start: number; end: number }

function sectionProgress(
  lines: readonly string[],
  section: Section
): Omit<ParsedArcaPriority, 'title' | 'queue' | 'line' | 'updatedAt'> {
  let done = 0
  let total = 0
  const blocked: ArcaPriorityBlockedTask[] = []
  const openTasks: ArcaPriorityOpenTask[] = []
  let fence: string | null = null
  for (let index = section.start + 1; index < section.end; index += 1) {
    const line = lines[index] ?? ''
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] ?? null
      fence = fence === null ? marker : fence === marker ? null : fence
      continue
    }
    if (fence !== null) {
      continue
    }
    const task = TASK.exec(line)
    if (!task) {
      continue
    }
    total += 1
    const completed = task[1]?.toLowerCase() === 'x'
    if (completed) {
      done += 1
    }
    const text = stripInline(task[2] ?? '')
    if (!completed) {
      openTasks.push({ text, line: index + 1 })
    }
    const block = !completed ? BLOCKED.exec(text) : null
    if (block) {
      blocked.push({
        text,
        blockedBy: (block[2] ?? '').trim().replace(/^\.\s*/, ''),
        line: index + 1
      })
    }
  }
  return {
    percent: total === 0 ? null : Math.round((100 * done) / total),
    done,
    total,
    blocked,
    completed: total > 0 && done === total,
    openTasks
  }
}

export function parseArcaPriority(markdown: string | null | undefined): ParsedArcaPriority {
  const lines = markdown?.split(/\r?\n/) ?? []
  const sections: (Section & { queue: boolean })[] = []
  const headings: { index: number; level: number }[] = []
  let fence: string | null = null
  let updatedAt: string | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] ?? null
      fence = fence === null ? marker : fence === marker ? null : fence
      continue
    }
    if (fence !== null) {
      continue
    }
    const updated = UPDATED.exec(line)
    if (updated && updatedAt === null) {
      updatedAt = updated[1] ?? null
    }
    const heading = HEADING.exec(line)
    if (!heading) {
      continue
    }
    const level = heading[1]?.length ?? 6
    headings.push({ index, level })
    const headingText = heading[2] ?? ''
    const priority = PRIORITY.exec(headingText)
    const queued = QUEUE.exec(headingText)
    if (priority || queued) {
      sections.push({
        title: stripInline((priority ?? queued)?.[2] ?? ''),
        level,
        start: index,
        end: lines.length,
        queue: Boolean(queued)
      })
    }
  }
  for (const section of sections) {
    const end = headings.find(
      (heading) => heading.index > section.start && heading.level <= section.level
    )
    if (end) {
      section.end = end.index
    }
  }
  const current = sections.find((section) => !section.queue)
  const empty = { percent: null, done: 0, total: 0, blocked: [], completed: false, openTasks: [] }
  const progress = current ? sectionProgress(lines, current) : empty
  return {
    title: current?.title || null,
    ...progress,
    queue: sections
      .filter((section) => section.queue)
      .slice(0, 5)
      .map((section) => ({ title: section.title, ...sectionProgress(lines, section) }))
      .map(({ title, percent, done, total }) => ({ title, percent, done, total })),
    line: current ? current.start + 1 : null,
    updatedAt
  }
}

export function sortArcaPriorities(
  projects: readonly ArcaPriorityProject[]
): ArcaPriorityProject[] {
  return [...projects].sort((left, right) => {
    const blocked = Number(right.blocked.length > 0) - Number(left.blocked.length > 0)
    if (blocked !== 0) {
      return blocked
    }
    const progress = (left.percent ?? 101) - (right.percent ?? 101)
    return progress !== 0 ? progress : left.name.localeCompare(right.name)
  })
}
