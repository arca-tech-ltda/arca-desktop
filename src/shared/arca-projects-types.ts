export type ArcaGitHubRepository = {
  name: string
  description: string | null
  isArchived: boolean
  url: string
  sshUrl: string
  pushedAt: string
}

export type ArcaProjectDiskState = 'missing' | 'arca_repo' | 'conflict'

export type ArcaProjectCandidate = ArcaGitHubRepository & {
  destination: string
  catalogued: boolean
  selected: boolean
  diskState: ArcaProjectDiskState
  diskError?: string
}

export type ArcaProjectsListResult =
  | { ok: true; projects: ArcaProjectCandidate[]; hiddenCount: number }
  | { ok: false; reason: 'gh_missing' | 'gh_auth' | 'catalog' | 'unknown'; message: string }

export type ArcaProjectDestinationInspection = {
  diskState: ArcaProjectDiskState
  diskError?: string
}
