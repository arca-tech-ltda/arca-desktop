import { useCliRegistrationStatus } from '@/hooks/useCliRegistrationStatus'
import { ARCA_PI_IS_AUTHORITY } from '../../../../shared/arca-product'

export type SetupGuideCliRegistration = {
  registered: boolean
  checked: boolean
}

/** Only the Pi-authority checklist completes its CLI step from registration, so only it probes. */
export function useSetupGuideCliRegistration(refreshEnabled: boolean): SetupGuideCliRegistration {
  const { checked, registered } = useCliRegistrationStatus({
    enabled: refreshEnabled && ARCA_PI_IS_AUTHORITY
  })
  return { registered, checked: !ARCA_PI_IS_AUTHORITY || checked }
}
