import { ARCA_ORG } from './arca-project-creation'

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
/** Repos the installer owns and nobody opens as a project; hidden without being legacy. */
export const ARCA_HIDDEN_PROJECTS = ['arca'] as const

type ArcaProjectVisibility = {
  name?: string
  repoKey?: string
  archived?: boolean
  legacy?: boolean
}

/** Repo name when `repoKey` points at the ARCA org, else undefined. */
function arcaOrgRepoName(repoKey: string | undefined): string | undefined {
  const segments = repoKey?.trim().toLowerCase().split('/').filter(Boolean) ?? []
  const [org, name] = segments.slice(-2)
  return org === ARCA_ORG ? name : undefined
}

export function isArcaProjectExcludedByDefault(project: ArcaProjectVisibility): boolean {
  const name = project.name?.trim().toLowerCase()
  const repoName = project.repoKey?.split('/').at(-1)?.trim().toLowerCase()
  if (project.archived === true || project.legacy === true) {
    return true
  }
  if (ARCA_LEGACY_PROJECTS.some((legacy) => legacy === name || legacy === repoName)) {
    return true
  }
  // Exact name, ARCA org only: `arca-desktop` and forks elsewhere stay visible.
  const hiddenCandidate = project.repoKey ? arcaOrgRepoName(project.repoKey) : name
  return ARCA_HIDDEN_PROJECTS.some((hidden) => hidden === hiddenCandidate)
}
