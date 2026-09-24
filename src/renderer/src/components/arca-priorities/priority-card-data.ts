import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'

type ActiveWorkspace = { repoId: string } | null

export function selectCurrentStatusProject(
  projects: readonly StatusMdTaskProject[],
  activeWorkspace: ActiveWorkspace
): StatusMdTaskProject | null {
  if (!activeWorkspace || activeWorkspace.repoId.startsWith('folder-workspace:')) {
    return null
  }
  return projects.find((project) => project.repoId === activeWorkspace.repoId) ?? null
}

export function selectProjectCardTasks(
  project: StatusMdTaskProject,
  priority: ArcaPriorityProject | null
): StatusMdTask[] {
  const open = project.tasks.filter((task) => !task.completed)
  if (!priority?.title) {
    return open.slice(0, 5)
  }
  const priorityLines = new Set(priority.openTasks.map((task) => task.line))
  return open.filter((task) => priorityLines.has(task.lineNumber)).slice(0, 5)
}

export function statusProjectProgress(project: StatusMdTaskProject): {
  done: number
  total: number
  percent: number
} {
  const total = project.tasks.length
  const done = project.tasks.filter((task) => task.completed).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done * 100) / total) }
}
