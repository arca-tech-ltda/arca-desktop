export type ArcaCatalogEntry = {
  repoKey: string
  name: string
  url: string
  destination: string
  pathFromCatalog?: boolean
  archived?: boolean
  legacy?: boolean
  source: 'mainframe' | 'file' | 'github'
}
export type ArcaSyncRow = ArcaCatalogEntry & {
  diskPath?: string
  repoId?: string
  state:
    | 'missing'
    | 'updated'
    | 'behind'
    | 'ahead'
    | 'dirty'
    | 'branch'
    | 'cloning'
    | 'conflict'
    | 'inaccessible'
    | 'paused'
    | 'error'
  ahead?: number
  behind?: number
  clonePercent?: number
  error?: string
}
export type ArcaSyncStatus = {
  running: boolean
  autoUpdate: boolean
  lastSync?: string
  sources: string[]
  errors: string[]
  projects: ArcaSyncRow[]
  outside: { repoKey: string; path: string }[]
  cloneProgress?: { current: number; total: number; name: string; percent: number }
  diskWarning?: string
}
export const emptyArcaSyncStatus: ArcaSyncStatus = {
  running: false,
  autoUpdate: true,
  sources: [],
  errors: [],
  projects: [],
  outside: []
}
export type ArcaProjectsSyncApi = {
  status(): Promise<ArcaSyncStatus>
  syncNow(): Promise<ArcaSyncStatus>
  setAutoUpdate(enabled: boolean): Promise<ArcaSyncStatus>
  onChange(callback: (status: ArcaSyncStatus) => void): () => void
  onRepoUpdated(callback: (repoId: string) => void): () => void
}
