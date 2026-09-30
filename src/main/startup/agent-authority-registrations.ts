import type { AgentAuthorityMode } from '../../shared/agent-authority'
import { registerPiAccounts, unregisterPiAccounts } from '../pi-accounts/registration'
import { registerPiAccountUsage, unregisterPiAccountUsage } from '../pi-account-usage/registration'
import {
  registerManagedAccountProjects,
  unregisterManagedAccountProjects
} from '../managed-account-projects/registration'
import type { ManagedAccountSettingsSource } from '../managed-account-projects/managed-account-project-map'
import { ensureMegamindAgentRegistrations } from '../arca-megamind/megamind-agent-registration'
import { standDownManagedHostAccountsForPiAuthority } from './main-process-account-services'

/**
 * Each authority owns one set of credential surfaces: Pi's in `pi`, the managed Claude/Codex ones
 * in `managed`. The mode can flip after startup (the capability probe answers late, Pi is installed
 * or removed, the setting changes), so this runs again on every change instead of once during boot.
 */
export function applyAgentAuthorityRegistrations(
  mode: AgentAuthorityMode,
  settings: ManagedAccountSettingsSource
): void {
  if (mode === 'pi') {
    unregisterManagedAccountProjects()
    registerPiAccounts()
    registerPiAccountUsage()
    standDownManagedHostAccountsForPiAuthority()
    return
  }
  unregisterPiAccounts()
  unregisterPiAccountUsage()
  registerManagedAccountProjects(settings)
  // Claude Code and Codex are the agents here, so they are the ones that must reach Megamind.
  try {
    ensureMegamindAgentRegistrations()
  } catch (error) {
    console.warn('[megamind] could not register the agent MCP server or skill:', error)
  }
}
