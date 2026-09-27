import { MEGAMIND_GROUP_CHANNEL } from '../../../shared/arca-megamind-chat'
import type { MegamindPanelRoute, MegamindSubTab } from '../../../shared/arca-megamind'

/**
 * Which Megamind sub-tab (and channel) the panel shows. It lives outside React because a
 * notification click, a deep link and the panel's own tab strip all steer the same surface, and
 * the panel may not be mounted when the first two arrive.
 */
type MegamindPanelState = {
  tab: MegamindSubTab
  /** Channel a notification asked for; the chat tab consumes it once. */
  requestedChannel?: string
  approvalId?: string
  /** Handle the presence tab asked the composer to mention. */
  pendingMention?: string
}

let state: MegamindPanelState = { tab: 'chat' }
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

export function setMegamindSubTab(tab: MegamindSubTab): void {
  if (state.tab !== tab) {
    update({ ...state, tab })
  }
}

export function routeMegamindPanel(route: MegamindPanelRoute): void {
  update({
    tab: route.tab,
    requestedChannel: route.channel,
    approvalId: route.approvalId,
    pendingMention: state.pendingMention
  })
}

export function consumeMegamindRequestedChannel(): void {
  if (state.requestedChannel) {
    update({ ...state, requestedChannel: undefined })
  }
}

/** Presence → composer: opens the group chat with `@handle-pi` typed in. */
export function requestMegamindMention(handle: string): void {
  // An agent mention only wakes the agent in the group channel, never inside someone else's DM.
  update({
    ...state,
    tab: 'chat',
    requestedChannel: MEGAMIND_GROUP_CHANNEL,
    pendingMention: handle
  })
}

export function consumeMegamindMention(): void {
  if (state.pendingMention) {
    update({ ...state, pendingMention: undefined })
  }
}
