import { useEffect, useRef } from 'react'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { applyAgentPermissionMode } from '../../../../shared/tui-agent-permissions'
import { resolveStepIndex, type OnboardingStepSkipOptions } from './onboarding-flow-state'

type AgentDetectionArgs = {
  currentStepId: string
  refreshDetectedAgents: () => Promise<TuiAgent[]>
  selectedAgentRef: { current: TuiAgent | null }
  setSelectedAgent: (agent: TuiAgent | null) => void
  setYoloPermissions: (enabled: boolean) => void
  settings: GlobalSettings | null
  skipAgent: boolean
  skipOptions: OnboardingStepSkipOptions
  stepIndex: number
  setStepIndex: (index: number) => void
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void> | void
}

export function useOnboardingAgentDetection(args: AgentDetectionArgs): void {
  const piDefaultPersistedRef = useRef(false)
  useEffect(() => {
    if (!args.skipAgent || !args.settings || piDefaultPersistedRef.current) {
      return
    }
    piDefaultPersistedRef.current = true
    args.setSelectedAgent('pi')
    args.setYoloPermissions(false)
    void Promise.resolve(
      args.updateSettings({
        defaultTuiAgent: 'pi',
        ...applyAgentPermissionMode({
          mode: 'manual',
          agentDefaultArgs: args.settings.agentDefaultArgs,
          agentDefaultEnv: args.settings.agentDefaultEnv
        })
      })
    ).then(
      () => {
        if (args.currentStepId === 'agent') {
          args.setStepIndex(resolveStepIndex(args.stepIndex + 1, args.skipOptions, 'forward'))
        }
      },
      () => {
        piDefaultPersistedRef.current = false
      }
    )
  }, [args])

  const didAutoSelectRef = useRef(false)
  useEffect(() => {
    if (didAutoSelectRef.current) {
      return
    }
    didAutoSelectRef.current = true
    void args.refreshDetectedAgents().then((ids) => {
      if (args.selectedAgentRef.current !== null) {
        return
      }
      const preferred = ids.includes('pi')
        ? 'pi'
        : (getAgentCatalog().find((agent) => ids.includes(agent.id))?.id ?? null)
      args.setSelectedAgent(preferred)
    })
  }, [args])
}
