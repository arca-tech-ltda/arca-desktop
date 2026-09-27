export const ARCA_TASKS_STATUS_MD_ONLY = true
/**
 * Orca's own agent skills (browser use, computer use, orchestration) are never offered by the fork:
 * for Gabriel the Pi CLI drives the app, and for the partners the equivalent comes from the `arca`
 * installer. Credential ownership is a per-machine mode instead — see `shared/agent-authority.ts`.
 */
export const ARCA_ORCA_AGENT_SKILLS_HIDDEN = true
/** ARCA's installer configures the GitHub CLI, so onboarding never asks for it. */
export const ARCA_ONBOARDING_SKIPS_INTEGRATIONS = true
export const ARCA_LEGACY_PROJECTS = ['brain'] as const

type ArcaProjectVisibility = {
  name?: string
  repoKey?: string
  archived?: boolean
  legacy?: boolean
}

export function isArcaProjectExcludedByDefault(project: ArcaProjectVisibility): boolean {
  const name = project.name?.trim().toLowerCase()
  const repoName = project.repoKey?.split('/').at(-1)?.trim().toLowerCase()
  return (
    project.archived === true ||
    project.legacy === true ||
    ARCA_LEGACY_PROJECTS.some((legacy) => legacy === name || legacy === repoName)
  )
}
