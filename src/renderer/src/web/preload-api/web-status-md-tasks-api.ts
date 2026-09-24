import type { StatusMdTasksApi } from '../../../../preload/api/status-md-tasks-api'

export function createWebStatusMdTasksApi(): StatusMdTasksApi {
  return {
    list: () => Promise.resolve([]),
    recent: () => Promise.resolve({ open: [], completed: [] }),
    onChanged: () => () => {}
  }
}
