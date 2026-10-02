type DraftEntry = {
  body: string
  revision: number
}

let nextRevision = 0

const drafts = new Map<string, DraftEntry>()
const listeners = new Set<() => void>()

function draftKey(scope: string, channel: string): string {
  return `${scope}\u0000${channel}`
}

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeMegamindComposerDrafts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function megamindComposerDraft(scope: string, channel: string): string {
  return drafts.get(draftKey(scope, channel))?.body ?? ''
}

export function megamindComposerDraftRevision(scope: string, channel: string): number {
  return drafts.get(draftKey(scope, channel))?.revision ?? 0
}

export function setMegamindComposerDraft(scope: string, channel: string, body: string): void {
  const key = draftKey(scope, channel)
  drafts.set(key, { body, revision: ++nextRevision })
  notify()
}

export function clearMegamindComposerDraftIfCurrent(
  scope: string,
  channel: string,
  body: string,
  revision: number
): void {
  const key = draftKey(scope, channel)
  const current = drafts.get(key)
  if (!current || current.body !== body || current.revision !== revision) {
    return
  }
  drafts.delete(key)
  notify()
}

/** Clears renderer-local drafts when a chat session changes. */
export function clearMegamindComposerDrafts(scope: string): void {
  const prefix = `${scope}\u0000`
  let changed = false
  for (const key of drafts.keys()) {
    if (key.startsWith(prefix)) {
      drafts.delete(key)
      changed = true
    }
  }
  if (changed) {
    notify()
  }
}
