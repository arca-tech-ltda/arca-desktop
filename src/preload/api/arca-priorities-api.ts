import type { ArcaPriorityProject } from '../../shared/arca-priorities'

export type ArcaPrioritiesApi = {
  list(): Promise<ArcaPriorityProject[]>
  onChange(callback: () => void): () => void
}
