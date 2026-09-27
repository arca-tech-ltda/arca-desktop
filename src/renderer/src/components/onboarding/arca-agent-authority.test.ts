import { describe, expect, it } from 'vitest'
import { ARCA_ORCA_AGENT_SKILLS_HIDDEN } from '../../../../shared/arca-product'
import { shouldSkipAgentStep, shouldSkipIntegrationsStep } from './onboarding-flow-state'
import { DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION } from './onboarding-feature-setup'

describe('ARCA onboarding agent gates', () => {
  it('skips agent selection only on a Pi-authority machine that has Pi', () => {
    expect(shouldSkipAgentStep(['pi'], 'pi')).toBe(true)
    expect(shouldSkipAgentStep(['claude'], 'pi')).toBe(false)
    expect(shouldSkipAgentStep(['pi'], 'managed')).toBe(false)
  })

  it('always hides task integrations', () => {
    expect(shouldSkipIntegrationsStep(null)).toBe(true)
  })

  it('disables bundled agent skill setup in both authority modes', () => {
    expect(ARCA_ORCA_AGENT_SKILLS_HIDDEN).toBe(true)
    expect(DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION).toEqual({
      browserUse: false,
      computerUse: false,
      orchestration: false,
      linearTickets: false
    })
  })
})
