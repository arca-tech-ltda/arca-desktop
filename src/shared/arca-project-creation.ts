export const ARCA_ORG = 'arca-tech-ltda'
export const ARCA_CATALOG_REPO = `${ARCA_ORG}/arca`

/** Folders that exist under ~/ARCA today (`clientes`, `plataforma`, `produtos`) plus internal work. */
export const ARCA_PROJECT_TYPES = ['clientes', 'produtos', 'plataforma', 'interno'] as const
export type ArcaProjectType = (typeof ARCA_PROJECT_TYPES)[number]

export function isArcaProjectType(value: unknown): value is ArcaProjectType {
  return ARCA_PROJECT_TYPES.some((type) => type === value)
}

export type ArcaSlugProblem = 'empty' | 'charset' | 'edges' | 'length'

/** Repository names travel into paths and URLs on three platforms; keep them boring. */
export function validateArcaProjectSlug(value: string): ArcaSlugProblem | undefined {
  const slug = value.trim()
  if (!slug) {
    return 'empty'
  }
  if (slug.length > 64) {
    return 'length'
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'charset'
  }
  if (slug.startsWith('-') || slug.endsWith('-') || slug.includes('--')) {
    return 'edges'
  }
  return undefined
}

export function suggestArcaProjectSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/, '')
}

export const ARCA_CREATION_STEPS = [
  'createRepo',
  'seedRepo',
  'register',
  'catalogPr',
  'mainframe'
] as const
export type ArcaCreationStepId = (typeof ARCA_CREATION_STEPS)[number]

export type ArcaCreationStepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export type ArcaCreationStep = {
  id: ArcaCreationStepId
  state: ArcaCreationStepState
  detail?: string
  link?: string
}

export type ArcaProjectCreationRequest = {
  name: string
  type: ArcaProjectType
  title?: string
  description: string
  /** Set by "Publish to ARCA": an existing local folder becomes the repository contents. */
  sourcePath?: string
  /** Publish only; off by default because moving a project invalidates open terminal paths. */
  moveToArcaRoot?: boolean
  /** Publish only; `arca` when the folder already has an `origin` pointing elsewhere. */
  remoteName?: string
}

export type ArcaProjectCreationProgress = {
  requestId: string
  steps: ArcaCreationStep[]
}

export type ArcaProjectCreationResult = {
  ok: boolean
  steps: ArcaCreationStep[]
  repoUrl?: string
  repoId?: string
  destination?: string
  pullRequestUrl?: string
  merged?: boolean
  /** Present on failure: what is already done and how to continue. */
  resume?: string
  error?: string
}

export type ArcaPublishEligibility = {
  eligible: boolean
  reason?: 'remote_host' | 'already_arca' | 'unknown_path'
  suggestedName?: string
  suggestedType?: ArcaProjectType
  isGitRepo?: boolean
  originUrl?: string
}

export type ArcaProjectCreationApi = {
  create(request: ArcaProjectCreationRequest): Promise<ArcaProjectCreationResult>
  publishEligibility(path: string): Promise<ArcaPublishEligibility>
  onProgress(callback: (progress: ArcaProjectCreationProgress) => void): () => void
}
