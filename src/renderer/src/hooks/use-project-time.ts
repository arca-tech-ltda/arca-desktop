import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { useEffect } from 'react'
import { useAppStore } from '../store'
import { activeProjectSeconds } from '../../../shared/project-time'

export function useProjectTime(): void {
  useEffect(() => {
    let previous = Date.now()
    let lastInput = Number.NEGATIVE_INFINITY
    let focused = document.hasFocus()
    let state = useAppStore.getState()
    const getRepo = () => {
      const worktree = state.activeWorktreeId
        ? state.getKnownWorktreeById(
            state.activeWorktreeId,
            state.activeWorkspaceExecutionHostId ?? undefined
          )
        : undefined
      return state.repos.find(
        (repo) =>
          repo.id === worktree?.repoId &&
          getRepoExecutionHostId(repo) === (worktree?.hostId ?? 'local')
      )
    }
    let repo = getRepo()
    const tick = () => {
      const now = Date.now()
      const seconds = activeProjectSeconds(previous, now, lastInput, focused)
      previous = now
      if (repo && seconds > 0) {
        void window.api.stats
          .tickProjectTime({
            repoId: repo.id,
            displayName: repo.displayName,
            seconds,
            endedAt: Math.min(now, lastInput + 300_000)
          })
          .catch((error) => console.error('[project-time] Tick failed:', error))
      }
    }
    const unsubscribe = useAppStore.subscribe((next) => {
      if (
        next.activeWorktreeId === state.activeWorktreeId &&
        next.activeWorkspaceExecutionHostId === state.activeWorkspaceExecutionHostId &&
        next.worktreesByRepo === state.worktreesByRepo &&
        next.detectedWorktreesByRepo === state.detectedWorktreesByRepo &&
        next.folderWorkspaces === state.folderWorkspaces &&
        next.repos === state.repos
      ) {
        return
      }
      state = next
      const nextRepo = getRepo()
      if (nextRepo?.id !== repo?.id || nextRepo?.displayName !== repo?.displayName) {
        tick()
        repo = nextRepo
      }
    })
    const input = (event: Event) => {
      if (!event.isTrusted || !document.hasFocus()) {
        return
      }
      const now = Date.now()
      if (event.type === 'pointermove' && now - lastInput < 1000) {
        return
      }
      // Settle the idle interval before new input can make it eligible again.
      if (now - lastInput >= 300_000) {
        tick()
      }
      lastInput = now
    }
    const focus = () => {
      previous = Date.now()
      focused = true
    }
    const blur = () => {
      tick()
      focused = false
    }
    const events = ['keydown', 'mousedown', 'wheel', 'pointermove']
    events.forEach((event) =>
      window.addEventListener(event, input, { capture: true, passive: true })
    )
    window.addEventListener('focus', focus)
    window.addEventListener('blur', blur)
    window.addEventListener('pagehide', blur)
    const timer = setInterval(tick, 15_000)
    return () => {
      tick()
      unsubscribe()
      clearInterval(timer)
      events.forEach((event) => window.removeEventListener(event, input, true))
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pagehide', blur)
    }
  }, [])
}
