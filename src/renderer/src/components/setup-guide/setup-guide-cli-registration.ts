import { useCliRegistrationStatus } from '@/hooks/useCliRegistrationStatus'
import { ARCA_ORCA_AGENT_SKILLS_HIDDEN } from '../../../../shared/arca-product'

export type SetupGuideCliRegistration = {
  registered: boolean
  checked: boolean
}

/** The fork's checklist completes its CLI step from registration alone. */
export function useSetupGuideCliRegistration(refreshEnabled: boolean): SetupGuideCliRegistration {
  const { checked, registered } = useCliRegistrationStatus({
    enabled: refreshEnabled && ARCA_ORCA_AGENT_SKILLS_HIDDEN
  })
  return { registered, checked: !ARCA_ORCA_AGENT_SKILLS_HIDDEN || checked }
}
