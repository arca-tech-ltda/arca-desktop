import { useEffect, useState } from 'react'
import {
  INITIAL_AGENT_AUTHORITY_STATE,
  MANAGED_AGENT_AUTHORITY_STATE,
  type AgentAuthorityMode,
  type AgentAuthorityState
} from '../../../shared/agent-authority'

let state: AgentAuthorityState = INITIAL_AGENT_AUTHORITY_STATE
let subscribed = false
const listeners = new Set<() => void>()

function publish(next: AgentAuthorityState): void {
  if (
    next.mode === state.mode &&
    next.preference === state.preference &&
    next.resolved === state.resolved
  ) {
    return
  }
  state = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Main owns the mode; the renderer only mirrors it. A client with no main process to ask (the web
 * client) stays on plain Orca behaviour: managed accounts, resolved immediately.
 */
export function ensureAgentAuthoritySubscription(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  const api = window.api?.agentAuthority
  if (!api) {
    publish(MANAGED_AGENT_AUTHORITY_STATE)
    return
  }
  api.onChange(publish)
  void api
    .get()
    .then(publish)
    .catch(() => {})
}

/** Non-React read, for code that runs outside a component. */
export function getAgentAuthority(): AgentAuthorityState {
  return state
}

export function useAgentAuthority(): AgentAuthorityState {
  const [current, setCurrent] = useState(state)
  useEffect(() => {
    ensureAgentAuthoritySubscription()
    setCurrent(state)
    return subscribe(() => setCurrent(state))
  }, [])
  return current
}

export function useAgentAuthorityMode(): AgentAuthorityMode {
  return useAgentAuthority().mode
}

/** Re-probes for a Pi that was installed or removed while the app was running. */
export function refreshAgentAuthority(): void {
  const api = window.api?.agentAuthority
  if (!api) {
    return
  }
  void api
    .refresh()
    .then(publish)
    .catch(() => {})
}

export function setAgentAuthorityForTest(next: AgentAuthorityState): void {
  subscribed = true
  publish(next)
}
