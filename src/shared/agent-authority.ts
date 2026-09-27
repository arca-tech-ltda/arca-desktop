import type { TuiAgent } from './tui-agent'

/**
 * Who owns agent credentials on this computer.
 *
 * `pi`: Gabriel's machines — the Pi bucket is the single source of accounts, and the Claude/Codex
 * managed-account surfaces the fork inherited from Orca stay hidden.
 * `managed`: the partners' machines — Claude Code and Codex are the agents, so their Orca account
 * surfaces come back and nothing Pi-specific is registered.
 */
export type AgentAuthorityMode = 'pi' | 'managed'

/** `arca.agentAuthority`: an explicit choice always wins over the Pi capability probe. */
export type AgentAuthorityPreference = 'auto' | 'pi' | 'managed'

export const AGENT_AUTHORITY_PREFERENCES: readonly AgentAuthorityPreference[] = [
  'auto',
  'pi',
  'managed'
]

export type AgentAuthorityState = {
  mode: AgentAuthorityMode
  preference: AgentAuthorityPreference
  /** False while `auto` still waits for `pi --arca-capabilities`; surfaces show a loading state. */
  resolved: boolean
}

/**
 * Conservative until proven otherwise: an unanswered probe reads as `managed`, because a machine
 * without a patched Pi is the common case and the Pi surfaces would be inert there anyway. The
 * `resolved` flag is what keeps the UI from flashing the wrong accounts screen in between.
 */
export const INITIAL_AGENT_AUTHORITY_STATE: AgentAuthorityState = {
  mode: 'managed',
  preference: 'auto',
  resolved: false
}

/** Fallback for clients with no main process to ask (web client): plain Orca behaviour. */
export const MANAGED_AGENT_AUTHORITY_STATE: AgentAuthorityState = {
  mode: 'managed',
  preference: 'auto',
  resolved: true
}

export function normalizeAgentAuthorityPreference(value: unknown): AgentAuthorityPreference {
  return value === 'pi' || value === 'managed' ? value : 'auto'
}

/** `piSupported` is `null` while the capability probe has not answered yet. */
export function resolveAgentAuthority(
  preference: AgentAuthorityPreference,
  piSupported: boolean | null
): AgentAuthorityState {
  if (preference !== 'auto') {
    return { mode: preference, preference, resolved: true }
  }
  return {
    mode: piSupported === true ? 'pi' : 'managed',
    preference,
    resolved: piSupported !== null
  }
}

/** The agent a fresh install pre-selects: Pi where Pi owns the machine, Claude Code otherwise. */
export function preferredAgentForAuthority(mode: AgentAuthorityMode): TuiAgent {
  return mode === 'pi' ? 'pi' : 'claude'
}

export type AgentAuthorityApi = {
  get: () => Promise<AgentAuthorityState>
  /** Re-runs the Pi capability probe; the answer arrives through `onChange`. */
  refresh: () => Promise<AgentAuthorityState>
  onChange: (callback: (state: AgentAuthorityState) => void) => () => void
}
