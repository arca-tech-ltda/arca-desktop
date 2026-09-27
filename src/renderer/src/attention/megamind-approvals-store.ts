import type { MegamindApproval } from '../../../shared/arca-megamind'

export type MegamindApprovalsState = {
  items: MegamindApproval[]
  /** The Mainframe session expired: decisions need a fresh login before they land. */
  login: boolean
  error: boolean
}

const EMPTY: MegamindApprovalsState = { items: [], login: false, error: false }
const POLL_INTERVAL = 30_000

let state = EMPTY
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function update(next: MegamindApprovalsState): void {
  state = next
  for (const listener of listeners) {
    listener()
  }
}

export function megamindApprovalsSnapshot(): MegamindApprovalsState {
  return state
}

export function subscribeMegamindApprovals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function refreshMegamindApprovals(): void {
  const api = window.api.arcaMegamind
  if (!api) {
    return
  }
  void api
    .approvals()
    .then((items) => update({ items, login: false, error: false }))
    .catch(() => update({ ...state, error: true }))
}

/**
 * Pending approvals are polled for the whole app, not for the panel: the tab badge and the
 * notification both have to be right before anyone opens Megamind.
 */
export function startMegamindApprovalsPolling(): () => void {
  refreshMegamindApprovals()
  timer ??= setInterval(refreshMegamindApprovals, POLL_INTERVAL)
  return () => {
    clearInterval(timer)
    timer = undefined
  }
}

export async function decideMegamindApproval(
  id: string,
  decision: 'approved' | 'denied'
): Promise<'ok' | 'login' | 'error'> {
  try {
    const result = await window.api.arcaMegamind.decide(id, decision)
    if (result === 'login') {
      update({ ...state, login: true })
      return 'login'
    }
    update({
      items: state.items.filter((item) => item.id !== id),
      login: false,
      error: false
    })
    return 'ok'
  } catch {
    update({ ...state, error: true })
    return 'error'
  }
}
