import {
  isPiAccountSelectableProject,
  piAccountEnvKey,
  PI_ACCOUNT_PROVIDERS
} from '../../shared/pi-account-projects'
import { getPiAccountProjectsService, type PiAccountProjectsService } from './account-project-map'

export type PiAccountPtyEnvInput = {
  /** Project (repo or folder workspace) path; the mapping key. */
  projectPath?: string | null
  cwd?: string | null
  /** SSH target. Anything non-null means the bucket lives on another host. */
  connectionId?: string | null
  /** WSL runs its own Pi bucket inside the guest; the host mapping does not apply. */
  isWsl?: boolean
  tabId?: string | null
  worktreeId?: string | null
  /** Env already assembled for this PTY; an explicit choice ("New Pi with account…") wins. */
  existingEnv?: Record<string, string> | undefined
  service?: PiAccountProjectsService | null
}

function isLocalHostLaunch(input: PiAccountPtyEnvInput): boolean {
  return (
    input.isWsl !== true &&
    isPiAccountSelectableProject({ connectionId: input.connectionId, path: input.cwd }) &&
    isPiAccountSelectableProject({ connectionId: input.connectionId, path: input.projectPath })
  )
}

/**
 * `PI_ACCOUNT_*` for a terminal opened in a mapped project (contract v1 §6). Local host only:
 * on SSH and WSL the bucket, the lock and the Pi binary all belong to the execution host.
 * Also records the effective account so the tab badge and the remove guard can see it.
 */
export function buildPiAccountPtyEnv(input: PiAccountPtyEnvInput): Record<string, string> {
  const service = input.service ?? getPiAccountProjectsService()
  if (!service || !isLocalHostLaunch(input)) {
    return {}
  }
  const selection = service.resolveSelection({
    projectPath: input.projectPath,
    cwd: input.cwd
  })
  const injected: Record<string, string> = {}
  for (const provider of PI_ACCOUNT_PROVIDERS) {
    const key = piAccountEnvKey(provider)
    const explicit = input.existingEnv?.[key]
    const name = explicit ?? selection[provider]
    if (!name) {
      continue
    }
    if (!explicit) {
      injected[key] = name
    }
    if (input.tabId) {
      service.recordSession({
        tabId: input.tabId,
        provider,
        name,
        ...(input.worktreeId ? { worktreeId: input.worktreeId } : {})
      })
    }
  }
  return injected
}

/**
 * Same decision, applied to the env a spawn is about to use. Defence in depth: on SSH and WSL any
 * `PI_ACCOUNT_*` already in the env (a stale launch config, a UI that should have hidden the menu)
 * is stripped, so an account name of this computer never names an account on the other host.
 */
export function applyPiAccountPtyEnv(
  env: Record<string, string>,
  input: PiAccountPtyEnvInput
): void {
  if (!isLocalHostLaunch(input)) {
    for (const provider of PI_ACCOUNT_PROVIDERS) {
      delete env[piAccountEnvKey(provider)]
    }
    return
  }
  Object.assign(env, buildPiAccountPtyEnv({ existingEnv: env, ...input }))
}
