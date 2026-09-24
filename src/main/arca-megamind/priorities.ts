import type { MegamindRecord } from '../../shared/arca-megamind'

type PriorityProvider = () => Promise<MegamindRecord>

let provider: PriorityProvider | null = null
const listeners = new Set<() => void>()

export function setMegamindPriorityProvider(next: PriorityProvider | null): void {
  provider = next
}

export function listMegamindPriorities(): Promise<MegamindRecord> {
  if (!provider) {
    return Promise.reject(new Error('Megamind priorities unavailable'))
  }
  return provider()
}

export function onMegamindPrioritiesChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyMegamindPrioritiesChanged(): void {
  for (const listener of listeners) {
    listener()
  }
}
