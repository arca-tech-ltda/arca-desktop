import type { StatusMdTask } from '../../shared/status-md-tasks'

export type StatusMdTaskProject = {
  repoId: string
  name: string
  path: string
  statusPath: string
  status: 'available' | 'missing' | 'unavailable'
  tasks: StatusMdTask[]
  updatedAt: string | null
}

export type StatusMdRecentTask = {
  repoId: string
  projectName: string
  path: string
  statusPath: string
  task: StatusMdTask
  changedAt: number
}

export type StatusMdRecentTasks = {
  open: StatusMdRecentTask[]
  completed: StatusMdRecentTask[]
}

export type StatusMdTasksApi = {
  list: () => Promise<StatusMdTaskProject[]>
  recent: () => Promise<StatusMdRecentTasks>
  onChanged: (callback: (payload: { repoId: string }) => void) => () => void
}
