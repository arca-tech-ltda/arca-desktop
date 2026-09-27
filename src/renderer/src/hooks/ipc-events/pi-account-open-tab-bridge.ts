import { useAppStore } from '../../store'

function openTerminalTabIds(): string[] {
  return Object.values(useAppStore.getState().tabsByWorktree).flatMap((tabs) =>
    (tabs ?? []).map((tab) => tab.id)
  )
}

/**
 * Tells main which terminal tabs still exist, so a Pi account badge (and the "account in use"
 * guard behind Remove) does not outlive the terminal that claimed it.
 */
export function registerPiAccountOpenTabBridge(unsubs: (() => void)[]): void {
  const api = window.api?.piAccountProjects
  if (!api) {
    return
  }
  let previous = ''
  const push = (): void => {
    const ids = openTerminalTabIds()
    const serialized = ids.join('\u0000')
    if (serialized === previous) {
      return
    }
    previous = serialized
    void api.syncOpenTabs(ids).catch(() => {})
  }
  push()
  unsubs.push(useAppStore.subscribe(push))
}
