import { useEffect, useState } from 'react'
import type { ArcaPublishEligibility } from '../../../../shared/arca-project-creation'

/**
 * Asks main only while the menu is open, and keeps the answer afterwards so the dialog
 * the menu item opens still has its prefill once the menu unmounts.
 */
export function useArcaPublishEligibility(
  projectPath: string | undefined,
  enabled: boolean
): ArcaPublishEligibility | undefined {
  const [eligibility, setEligibility] = useState<ArcaPublishEligibility | undefined>(undefined)
  useEffect(() => {
    if (!enabled || !projectPath) {
      return
    }
    let cancelled = false
    void window.api.arcaProjectCreation
      .publishEligibility(projectPath)
      .then((result) => {
        if (!cancelled) {
          setEligibility(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEligibility({ eligible: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, projectPath])
  return eligibility
}
