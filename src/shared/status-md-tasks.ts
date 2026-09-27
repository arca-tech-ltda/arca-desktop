export type StatusMdTask = {
  id: string
  title: string
  rawText: string
  completed: boolean
  depth: number
  section: string | null
  lineNumber: number
}

export type ParsedStatusMd = {
  tasks: StatusMdTask[]
  updatedAt: string | null
}

const TASK_LINE = /^(\s*)([-*+])\s+\[([ xX])]\s+(.+?)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const UPDATED = /^\s*>\s*atualizado\s*:\s*(.+?)\s*$/i
const MAX_TASKS = 1000

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

function shortTextHash(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}

function indentationDepth(indentation: string): number {
  let columns = 0
  for (const character of indentation) {
    columns += character === '\t' ? 4 : 1
  }
  return Math.floor(columns / 2)
}

export function parseStatusMd(
  markdown: string | null | undefined,
  repoId = 'repo'
): ParsedStatusMd {
  if (!markdown) {
    return { tasks: [], updatedAt: null }
  }

  const tasks: StatusMdTask[] = []
  let section: string | null = null
  let fence: string | null = null
  let updatedAt: string | null = null

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) {
        fence = marker
      } else if (fence === marker) {
        fence = null
      }
      continue
    }
    if (fence !== null) {
      continue
    }

    const updatedMatch = UPDATED.exec(line)
    if (updatedMatch && updatedAt === null) {
      updatedAt = updatedMatch[1]
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      section = stripInlineMarkdown(heading[2]) || null
      continue
    }

    const task = TASK_LINE.exec(line)
    if (!task || tasks.length >= MAX_TASKS) {
      continue
    }
    const rawText = task[4].trim()
    const title = stripInlineMarkdown(rawText)
    if (!title) {
      continue
    }
    tasks.push({
      id: `${repoId}:${index + 1}:${shortTextHash(rawText)}`,
      title,
      rawText,
      completed: task[3].toLowerCase() === 'x',
      depth: indentationDepth(task[1]),
      section,
      lineNumber: index + 1
    })
  }

  return { tasks, updatedAt }
}

export function groupStatusMdTasksBySection(
  tasks: readonly StatusMdTask[]
): { section: string | null; tasks: StatusMdTask[] }[] {
  const groups: { section: string | null; tasks: StatusMdTask[] }[] = []
  for (const task of tasks) {
    const current = groups.at(-1)
    if (current && current.section === task.section) {
      current.tasks.push(task)
    } else {
      groups.push({ section: task.section, tasks: [task] })
    }
  }
  return groups
}

export function filterStatusMdTasks(
  tasks: readonly StatusMdTask[],
  filter: 'open' | 'all' | 'completed',
  search = ''
): StatusMdTask[] {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  return tasks.filter((task) => {
    const matchesFilter =
      filter === 'all' || (filter === 'completed' ? task.completed : !task.completed)
    const matchesSearch =
      normalizedSearch.length === 0 ||
      `${task.title} ${task.section ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
    return matchesFilter && matchesSearch
  })
}
