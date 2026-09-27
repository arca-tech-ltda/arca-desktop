import type { MegamindApproval, MegamindApprovalsResult } from '../../../shared/arca-megamind'

/**
 * Why the last approvals read or decision did not work. `transport` is a failed read (the list on
 * screen may be stale), the rest describe a decision the Mainframe refused.
 */
export type MegamindApprovalsProblem = 'transport' | 'forbidden' | 'conflict' | 'rate' | 'decide'

export type MegamindApprovalsState = {
  items: MegamindApproval[]
  /** The Mainframe session expired: decisions need a fresh login before they land. */
  login: boolean
  problem: MegamindApprovalsProblem | null
}

const EMPTY: MegamindApprovalsState = { items: [], login: false, problem: null }
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

function applyRead(result: MegamindApprovalsResult): void {
  if (result.ok) {
    update({ items: result.items, login: false, problem: null })
    return
  }
  update({ ...state, login: result.reason === 'login', problem: 'transport' })
}

export function refreshMegamindApprovals(): void {
  const api = window.api.arcaMegamind
  // An older preload, or the paired web client, has no approvals channel to poll.
  if (typeof api?.approvals !== 'function') {
    return
  }
  try {
    void Promise.resolve(api.approvals())
      .then(applyRead)
      .catch(() => update({ ...state, problem: 'transport' }))
  } catch {
    update({ ...state, problem: 'transport' })
  }
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

function drop(id: string, problem: MegamindApprovalsProblem | null): void {
  update({ items: state.items.filter((item) => item.id !== id), login: false, problem })
}

export async function decideMegamindApproval(
  id: string,
  decision: 'approved' | 'denied'
): Promise<'ok' | 'login' | 'forbidden' | 'conflict' | 'rate' | 'error'> {
  try {
    const result = await window.api.arcaMegamind.decide(id, decision)
    if (result === 'login') {
      update({ ...state, login: true, problem: null })
      return 'login'
    }
    if (result === 'conflict') {
      // Already decided or expired: keeping the buttons would only fail again.
      drop(id, 'conflict')
      return 'conflict'
    }
    if (result === 'forbidden' || result === 'rate') {
      update({ ...state, problem: result })
      return result
    }
    if (result !== 'ok') {
      update({ ...state, problem: 'decide' })
      return 'error'
    }
    drop(id, null)
    return 'ok'
  } catch {
    update({ ...state, problem: 'decide' })
    return 'error'
  }
}
