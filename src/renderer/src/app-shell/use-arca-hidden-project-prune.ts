import { useEffect, useRef } from 'react'
import {
  markArcaRepoKeyPruned,
  planArcaHiddenProjectPrune,
  readPrunedArcaRepoKeys
} from '@/lib/arca-hidden-project-prune'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { useAppStore } from '../store'

async function pruneArcaHiddenProjects(): Promise<void> {
  const prunes = planArcaHiddenProjectPrune(useAppStore.getState().repos, readPrunedArcaRepoKeys())
  for (const prune of prunes) {
    try {
      // Why removeProject and not a catalog delete: it also tears down terminals and repo caches.
      await useAppStore.getState().removeProject(prune.repoId, { hostId: LOCAL_EXECUTION_HOST_ID })
      markArcaRepoKeyPruned(prune.repoKey)
    } catch (error) {
      console.error('Failed to unregister hidden ARCA project:', error)
    }
  }
}

/** One-shot per machine: drops sidebar registrations of ARCA repos registered before they were hidden. */
export function useArcaHiddenProjectPrune(enabled: boolean): void {
  const startedRef = useRef(false)
  useEffect(() => {
    if (!enabled || startedRef.current) {
      return
    }
    startedRef.current = true
    void pruneArcaHiddenProjects()
  }, [enabled])
}
