import type { ManagedAccountAgent } from '../../shared/managed-account-projects'
import { getManagedAccountProjectsService } from './managed-account-project-map'

/**
 * Removing an account a project is pinned to, or one a terminal is running on, is refused with a
 * message instead of silently moving those terminals to another login (same rule as the Pi bucket
 * accounts). Only applies in `managed` authority, where the map exists at all.
 */
export function assertManagedAccountRemovable(
  agent: ManagedAccountAgent,
  accountId: string,
  label = accountId
): void {
  const service = getManagedAccountProjectsService()
  if (!service) {
    return
  }
  if (service.getSessionsUsingAccount(agent, accountId).length > 0) {
    throw new Error(
      `${label} is running in an open terminal. Close those terminals before removing this account.`
    )
  }
  const projects = service.getProjectsUsingAccount(agent, accountId)
  if (projects.length > 0) {
    throw new Error(
      `${label} is the fixed account of ${projects.length} project(s). Set those projects back to the active account before removing it.`
    )
  }
}
