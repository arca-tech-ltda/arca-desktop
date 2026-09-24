import { describe, expect, it } from 'vitest'
import { ARCA_PI_IS_AUTHORITY } from '../../../../shared/arca-product'
import { shouldSkipAgentStep, shouldSkipIntegrationsStep } from './onboarding-flow-state'
import { DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION } from './onboarding-feature-setup'

describe('ARCA Pi authority gate', () => {
  it('skips agent selection only when Pi is detected and always hides task integrations', () => {
    expect(ARCA_PI_IS_AUTHORITY).toBe(true)
    expect(shouldSkipAgentStep(['pi'])).toBe(true)
    expect(shouldSkipAgentStep(['claude'])).toBe(false)
    expect(shouldSkipIntegrationsStep(null)).toBe(true)
  })

  it('disables bundled agent skill setup', () => {
    expect(DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION).toEqual({
      browserUse: false,
      computerUse: false,
      orchestration: false,
      linearTickets: false
    })
  })
})
