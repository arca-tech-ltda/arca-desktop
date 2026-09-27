import type { AgentAuthorityMode } from '../../shared/agent-authority'
import { registerPiAccounts, unregisterPiAccounts } from '../pi-accounts/registration'
import {
  registerPiAccountUsage,
  unregisterPiAccountUsage
} from '../pi-account-usage/registration'
import { standDownManagedHostAccountsForPiAuthority } from './main-process-account-services'

/**
 * Pi's credential surfaces exist only while this machine is in `pi` authority mode. The mode can
 * flip after startup (the capability probe answers late, Pi is installed or removed, the setting
 * changes), so this runs again on every change instead of once during boot.
 */
export function applyPiAuthorityRegistrations(mode: AgentAuthorityMode): void {
  if (mode === 'pi') {
    registerPiAccounts()
    registerPiAccountUsage()
    standDownManagedHostAccountsForPiAuthority()
    return
  }
  unregisterPiAccounts()
  unregisterPiAccountUsage()
}
