import type { MegamindPanelRoute } from '../../../shared/arca-megamind'

/**
 * What the Megamind panel should open. It lives outside React because a notification click and a
 * deep link both steer the same surface, and the panel may not be mounted when they arrive.
 */
type MegamindPanelState = {
  /** Conversation a notification asked for; the panel consumes it once. */
  requestedChannel?: string
  approvalId?: string
}

let state: MegamindPanelState = {}
const listeners = new Set<() => void>()

function update(next: MegamindPanelState): void {
  state = next
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeMegamindPanelRoute(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function megamindPanelRoute(): MegamindPanelState {
  return state
}

export function routeMegamindPanel(route: MegamindPanelRoute): void {
  update({ requestedChannel: route.channel, approvalId: route.approvalId })
}

export function consumeMegamindRequestedChannel(): void {
  if (state.requestedChannel) {
    update({ ...state, requestedChannel: undefined })
  }
}
