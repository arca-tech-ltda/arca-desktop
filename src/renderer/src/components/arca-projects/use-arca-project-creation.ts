import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ArcaCreationStep,
  ArcaProjectCreationRequest,
  ArcaProjectCreationResult
} from '../../../../shared/arca-project-creation'

type CreationState = {
  running: boolean
  steps: ArcaCreationStep[]
  result?: ArcaProjectCreationResult
}

export function useArcaProjectCreation(): CreationState & {
  start: (request: ArcaProjectCreationRequest) => Promise<ArcaProjectCreationResult>
  reset: () => void
} {
  const [state, setState] = useState<CreationState>({ running: false, steps: [] })
  const runningRef = useRef(false)

  useEffect(() => {
    return window.api.arcaProjectCreation.onProgress((progress) => {
      if (runningRef.current) {
        setState((current) => ({ ...current, steps: progress.steps }))
      }
    })
  }, [])

  const start = useCallback(
    async (request: ArcaProjectCreationRequest): Promise<ArcaProjectCreationResult> => {
      runningRef.current = true
      setState({ running: true, steps: [] })
      try {
        const result = await window.api.arcaProjectCreation.create(request)
        setState({ running: false, steps: result.steps, result })
        return result
      } catch (error) {
        const result: ArcaProjectCreationResult = {
          ok: false,
          steps: [],
          error: error instanceof Error ? error.message : String(error)
        }
        setState({ running: false, steps: [], result })
        return result
      } finally {
        runningRef.current = false
      }
    },
    []
  )

  const reset = useCallback(() => {
    setState({ running: false, steps: [] })
  }, [])

  return { ...state, start, reset }
}
