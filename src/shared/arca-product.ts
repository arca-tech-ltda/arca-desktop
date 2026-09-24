export const ARCA_TASKS_STATUS_MD_ONLY = true
export const ARCA_PI_IS_AUTHORITY = true
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
