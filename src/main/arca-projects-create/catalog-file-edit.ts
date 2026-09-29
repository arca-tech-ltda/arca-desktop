import { ARCA_ORG, type ArcaProjectType } from '../../shared/arca-project-creation'

export type ArcaCatalogAddition = {
  id: string
  title: string
  type: ArcaProjectType
  name: string
}

export function arcaCatalogRepoUrl(name: string): string {
  return `https://github.com/${ARCA_ORG}/${name}.git`
}

/** Appends the project to projects.json, preserving the file's 2-space layout. */
export function addProjectToCatalogJson(source: string, addition: ArcaCatalogAddition): string {
  const parsed: unknown = JSON.parse(source)
  if (typeof parsed !== 'object' || parsed === null || !('projects' in parsed)) {
    throw new Error('projects.json has no projects array')
  }
  const catalog: { projects: unknown } = { ...parsed, projects: parsed.projects }
  if (!Array.isArray(catalog.projects)) {
    throw new Error('projects.json has no projects array')
  }
  const projects = [...catalog.projects]
  if (
    projects.some(
      (project) =>
        typeof project === 'object' &&
        project !== null &&
        'id' in project &&
        project.id === addition.id
    )
  ) {
    throw new Error(`projects.json already has the id "${addition.id}"`)
  }
  projects.push({
    id: addition.id,
    title: addition.title,
    repos: [
      {
        url: arcaCatalogRepoUrl(addition.name),
        path: `${addition.type}/${addition.name}`
      }
    ]
  })
  return `${JSON.stringify({ ...catalog, projects }, null, 2)}\n`
}

export function catalogProjectIds(source: string): string[] {
  const parsed: unknown = JSON.parse(source)
  const projects =
    typeof parsed === 'object' && parsed !== null && 'projects' in parsed ? parsed.projects : []
  if (!Array.isArray(projects)) {
    return []
  }
  return projects
    .map((project) =>
      typeof project === 'object' &&
      project !== null &&
      'id' in project &&
      typeof project.id === 'string'
        ? project.id
        : ''
    )
    .filter(Boolean)
    .sort()
}

const IDS_ASSERTION = /(assert\.deepEqual\(\s*ids\s*,\s*)\[[^\]]*\]/

/**
 * `test/arca_workspace.test.ts` pins the catalog ids; a project added without it fails CI in `arca`.
 */
export function updateWorkspaceTestIds(source: string, ids: string[]): string {
  if (!IDS_ASSERTION.test(source)) {
    throw new Error('Could not find the catalog id assertion in arca_workspace.test.ts')
  }
  const rendered = ids.map((id) => JSON.stringify(id)).join(', ')
  return source.replace(IDS_ASSERTION, `$1[${rendered}]`)
}
