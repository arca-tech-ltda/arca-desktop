import {
  hasManagedHostAgentAccounts,
  INITIAL_AGENT_AUTHORITY_STATE,
  normalizeAgentAuthorityPreference,
  resolveAgentAuthority,
  type AgentAuthorityMode,
  type AgentAuthorityState,
  type ManagedHostAgentAccountSettings
} from '../../shared/agent-authority'
import {
  getPiAccountSelectionSupportAnswer,
  onPiAccountSelectionSupportChanged,
  refreshPiAccountSelectionSupport,
  setPiAccountSelectionSupportProbe
} from '../pi-accounts/pi-account-selection-support'
import { probePiAccountEnvSupport } from '../pi-accounts/pi-account-capabilities-probe'

type AgentAuthoritySettings = ManagedHostAgentAccountSettings & { agentAuthority?: unknown }

/** Only the fields the authority needs; keeps the service testable without a whole Store. */
export type AgentAuthoritySettingsSource = {
  getSettings: () => AgentAuthoritySettings
  onSettingsChanged: (
    listener: (updates: Partial<AgentAuthoritySettings>) => void
  ) => (() => void) | void
}

/** A change in any of these can flip `auto`, because managed accounts hold the Pi mode back. */
const AUTHORITY_SETTING_KEYS = [
  'agentAuthority',
  'claudeManagedAccounts',
  'codexManagedAccounts',
  'activeClaudeManagedAccountId',
  'activeCodexManagedAccountId',
  'activeClaudeManagedAccountIdsByRuntime',
  'activeCodexManagedAccountIdsByRuntime'
] as const

let current: AgentAuthorityState = INITIAL_AGENT_AUTHORITY_STATE
let settingsSource: AgentAuthoritySettingsSource | null = null
const listeners = new Set<(state: AgentAuthorityState) => void>()

export function getAgentAuthorityState(): AgentAuthorityState {
  return current
}

export function getAgentAuthorityMode(): AgentAuthorityMode {
  return current.mode
}

export function onAgentAuthorityChanged(
  listener: (state: AgentAuthorityState) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: AgentAuthorityState): void {
  if (
    next.mode === current.mode &&
    next.preference === current.preference &&
    next.resolved === current.resolved
  ) {
    return
  }
  current = next
  for (const listener of listeners) {
    listener(current)
  }
}

function recompute(): void {
  const settings = settingsSource?.getSettings() ?? {}
  const preference = normalizeAgentAuthorityPreference(settings.agentAuthority)
  publish(
    resolveAgentAuthority(
      preference,
      getPiAccountSelectionSupportAnswer(),
      hasManagedHostAgentAccounts(settings)
    )
  )
}

/**
 * Installs the Pi capability probe and follows both inputs of the mode: the `arca.agentAuthority`
 * setting and whether `pi --arca-capabilities` answers. The probe is never polled on a timer —
 * installing or removing Pi is picked up by `refreshAgentAuthority`, which the accounts screen and
 * every explicit setting change call.
 */
export function startAgentAuthority(source: AgentAuthoritySettingsSource): () => void {
  settingsSource = source
  setPiAccountSelectionSupportProbe(probePiAccountEnvSupport)
  const stopSupport = onPiAccountSelectionSupportChanged(() => recompute())
  const stopSettings = source.onSettingsChanged((updates) => {
    if (AUTHORITY_SETTING_KEYS.some((key) => key in updates)) {
      recompute()
    }
  })
  recompute()
  void refreshAgentAuthority()
  return () => {
    stopSupport()
    stopSettings?.()
    settingsSource = null
  }
}

export async function refreshAgentAuthority(): Promise<AgentAuthorityState> {
  await refreshPiAccountSelectionSupport()
  recompute()
  return current
}

export function resetAgentAuthorityForTest(): void {
  current = INITIAL_AGENT_AUTHORITY_STATE
  settingsSource = null
  listeners.clear()
}
