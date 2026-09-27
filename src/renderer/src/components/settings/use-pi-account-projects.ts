import { useCallback, useEffect, useState } from 'react'
import {
  emptyPiAccountProjectMap,
  getPiAccountProjectSelection,
  type PiAccountProjectSelection,
  type PiAccountProjectsState
} from '../../../../shared/pi-account-projects'
import type { PiAccountProvider } from '../../../../shared/pi-accounts'

export type PiAccountProjectsController = {
  /** False until the installed Pi declares support; every surface shows the choice disabled. */
  supported: boolean
  loaded: boolean
  state: PiAccountProjectsState
  /** The account fixed for a project path, empty when it follows the active account. */
  selectionFor: (projectPath: string | null | undefined) => PiAccountProjectSelection
  /** The account a terminal tab was opened with, for the tab badge. */
  sessionFor: (tabId: string, provider: PiAccountProvider) => string | null
  setProjectAccount: (
    projectPath: string,
    provider: PiAccountProvider,
    name: string | null
  ) => Promise<void>
}

// Path keys are folded on the host that wrote them; the renderer needs the same rule to read back.
function rendererPathPlatform(): NodeJS.Platform {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? 'win32'
    : 'darwin'
}

const EMPTY: PiAccountProjectsState = {
  supported: false,
  map: emptyPiAccountProjectMap(),
  sessions: []
}

/** Shared project → Pi account mapping for the sidebar menu, project settings and tab badges. */
export function usePiAccountProjects(): PiAccountProjectsController {
  const [state, setState] = useState<PiAccountProjectsState | null>(null)

  useEffect(() => {
    if (!window.api?.piAccountProjects) {
      return
    }
    let disposed = false
    const update = (next: PiAccountProjectsState): void => {
      if (!disposed) {
        setState(next)
      }
    }
    const api = window.api.piAccountProjects
    const stop = api.onChange(update)
    void api
      .get()
      .then(update)
      .catch(() => {})
    return () => {
      disposed = true
      stop()
    }
  }, [])

  const current = state ?? EMPTY
  const setProjectAccount = useCallback(
    async (
      projectPath: string,
      provider: PiAccountProvider,
      name: string | null
    ): Promise<void> => {
      const result = await window.api.piAccountProjects.set(projectPath, provider, name)
      setState(result.state)
    },
    []
  )

  return {
    supported: current.supported,
    loaded: state !== null,
    state: current,
    selectionFor: (projectPath) =>
      getPiAccountProjectSelection(current.map, projectPath, rendererPathPlatform()),
    sessionFor: (tabId, provider) =>
      current.sessions.find((session) => session.tabId === tabId && session.provider === provider)
        ?.name ?? null,
    setProjectAccount
  }
}
