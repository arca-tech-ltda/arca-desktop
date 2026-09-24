import type { Repo } from '../../shared/repo-types'
import type { ProjectTimeEntry } from '../../shared/project-time'
import { aggregateProjectTime } from '../../shared/project-time'
import type { ArcaPriorityProject } from '../../shared/arca-priorities'

export type PriorityNotification = { key: string; title: string; body: string }

export function mergePriorityProjects(
  local: readonly ArcaPriorityProject[],
  shared: readonly ArcaPriorityProject[]
): ArcaPriorityProject[] {
  const sharedByKey = new Map(
    shared.filter((item) => item.repoKey).map((item) => [item.repoKey, item])
  )
  const merged = local.map((item) => {
    const remote = item.repoKey ? sharedByKey.get(item.repoKey) : undefined
    if (!remote) {
      return item
    }
    sharedByKey.delete(item.repoKey)
    return {
      ...remote,
      repoId: item.repoId,
      name: remote.name || item.name,
      path: item.path,
      statusPath: item.statusPath,
      openTasks: item.openTasks
    }
  })
  return [...merged, ...sharedByKey.values()]
}

export function applyLocalHours(
  projects: readonly ArcaPriorityProject[],
  entries: readonly ProjectTimeEntry[],
  now = new Date()
): ArcaPriorityProject[] {
  const seconds = new Map(
    aggregateProjectTime([...entries], 7, now).map((item) => [item.repoId, item.seconds])
  )
  return projects.map((project) => {
    if (project.hours7d !== null || project.repoId === null) {
      return project
    }
    const localSeconds = seconds.get(project.repoId)
    return localSeconds === undefined
      ? project
      : { ...project, hours7d: localSeconds / 3600, hoursLabel: 'yours' }
  })
}

export function priorityNotifications(
  previous: readonly ArcaPriorityProject[],
  current: readonly ArcaPriorityProject[],
  seen: ReadonlySet<string>
): PriorityNotification[] {
  const notifications: PriorityNotification[] = []
  const identity = (project: ArcaPriorityProject): string => project.repoKey ?? project.projectId
  const currentByProject = new Map(current.map((item) => [identity(item), item]))
  for (const project of current) {
    const projectIdentity = identity(project)
    const before = previous.find((item) => identity(item) === projectIdentity)
    const oldBlocks = new Set(before?.blocked.map((item) => item.text) ?? [])
    for (const block of project.blocked) {
      const key = `blocked:${projectIdentity}:${block.text}`
      if (before && !oldBlocks.has(block.text) && !seen.has(key)) {
        notifications.push({
          key,
          title: `Prioridade bloqueada: ${project.name}`,
          body: block.blockedBy ? `${block.text} — bloqueado por ${block.blockedBy}` : block.text
        })
      }
    }
  }
  for (const before of previous) {
    if (!before.title || before.completed) {
      continue
    }
    const projectIdentity = identity(before)
    const after = currentByProject.get(projectIdentity)
    const completed =
      after?.title === before.title
        ? after.completed
        : Boolean(after?.title && after.title === before.queue[0]?.title)
    if (!completed) {
      continue
    }
    const next =
      after?.title === before.title
        ? after.queue[0]?.title
        : (after?.title ?? before.queue[0]?.title)
    const key = `completed:${projectIdentity}:${before.title}`
    if (!seen.has(key)) {
      notifications.push({
        key,
        title: next
          ? `Prioridade concluída: ${before.title} — próxima: ${next}`
          : `Prioridade concluída: ${before.title}`,
        body: before.name
      })
    }
  }
  return notifications
}

export function repoKey(repo: Repo): string | null {
  return (
    repo.gitRemoteIdentity?.canonicalKey
      .trim()
      .replace(/\.git$/i, '')
      .toLowerCase() ?? null
  )
}
