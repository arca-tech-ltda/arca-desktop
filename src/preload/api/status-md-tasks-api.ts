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

export type StatusMdTasksApi = {
  list: () => Promise<StatusMdTaskProject[]>
  onChanged: (callback: (payload: { repoId: string }) => void) => () => void
}
