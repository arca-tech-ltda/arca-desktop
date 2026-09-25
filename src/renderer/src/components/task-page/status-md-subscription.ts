export function subscribeStatusMdChanges(refresh: () => void): () => void {
  const stopTasks = window.api.statusMdTasks.onChanged(refresh)
  const stopSync = window.api.arcaProjectsSync.onRepoUpdated(refresh)
  return () => {
    stopTasks()
    stopSync()
  }
}
