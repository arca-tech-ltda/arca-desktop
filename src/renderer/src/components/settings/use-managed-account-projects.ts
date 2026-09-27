import { useCallback, useEffect, useState } from 'react'
import {
  emptyManagedAccountProjectMap,
  getManagedAccountProjectSelection,
  type ManagedAccountAgent,
  type ManagedAccountProjectSelection,
  type ManagedAccountProjectsState
} from '../../../../shared/managed-account-projects'
import { rendererPathPlatform } from './use-pi-account-projects'

export type ManagedAccountProjectsController = {
  loaded: boolean
  state: ManagedAccountProjectsState
  selectionFor: (projectPath: string | null | undefined) => ManagedAccountProjectSelection
  /** The account a terminal tab was opened with, for the tab badge. */
  sessionFor: (tabId: string, agent: ManagedAccountAgent) => string | null
  setProjectAccount: (
    projectPath: string,
    agent: ManagedAccountAgent,
    accountId: string | null
  ) => Promise<void>
}

const EMPTY: ManagedAccountProjectsState = {
  supported: false,
  map: emptyManagedAccountProjectMap(),
  sessions: [],
  accounts: []
}

/** Project → managed Claude/Codex account, for the sidebar menu, project settings and badges. */
export function useManagedAccountProjects(enabled = true): ManagedAccountProjectsController {
  const [state, setState] = useState<ManagedAccountProjectsState | null>(null)

  useEffect(() => {
    if (!enabled || !window.api?.managedAccountProjects) {
      return
    }
    let disposed = false
    const update = (next: ManagedAccountProjectsState): void => {
      if (!disposed) {
        setState(next)
      }
    }
    const api = window.api.managedAccountProjects
    const stop = api.onChange(update)
    void api
      .get()
      .then(update)
      .catch(() => {})
    return () => {
      disposed = true
      stop()
    }
  }, [enabled])

  const current = state ?? EMPTY
  const setProjectAccount = useCallback(
    async (
      projectPath: string,
      agent: ManagedAccountAgent,
      accountId: string | null
    ): Promise<void> => {
      const result = await window.api.managedAccountProjects.set(projectPath, agent, accountId)
      setState(result.state)
    },
    []
  )

  return {
    loaded: state !== null,
    state: current,
    selectionFor: (projectPath) =>
      getManagedAccountProjectSelection(current.map, projectPath, rendererPathPlatform()),
    sessionFor: (tabId, agent) =>
      current.sessions.find((session) => session.tabId === tabId && session.agent === agent)
        ?.label ?? null,
    setProjectAccount
  }
}

/**
 * Main refuses to remove an account a terminal is running on, and only the renderer knows which
 * terminals still exist. Refresh that list right before the check.
 */
export async function reportOpenManagedAccountTabs(tabIds: string[]): Promise<void> {
  await window.api?.managedAccountProjects?.syncOpenTabs(tabIds).catch(() => {})
}
