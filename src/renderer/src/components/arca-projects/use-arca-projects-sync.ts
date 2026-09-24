import { useSyncExternalStore } from 'react'
import { emptyArcaSyncStatus, type ArcaSyncStatus } from '../../../../shared/arca-projects-sync'

let snapshot = emptyArcaSyncStatus
const listeners = new Set<() => void>()
let unsubscribe: (() => void) | undefined
function publish(status: ArcaSyncStatus): void {
  snapshot = status
  for (const listener of listeners) {
    listener()
  }
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!unsubscribe) {
    unsubscribe = window.api.arcaProjectsSync.onChange(publish)
    void window.api.arcaProjectsSync
      .status()
      .then(publish)
      .catch(() => {})
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
}
export function useArcaProjectsSync(): ArcaSyncStatus {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => emptyArcaSyncStatus
  )
}
