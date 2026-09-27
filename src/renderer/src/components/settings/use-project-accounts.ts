import { translate } from '@/i18n/i18n'
import { useAgentAuthorityMode } from '@/store/agent-authority'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  managedAccountEnvKey,
  MANAGED_ACCOUNT_AGENTS,
  type ManagedAccountAgent
} from '../../../../shared/managed-account-projects'
import { piAccountEnvKey, PI_ACCOUNT_PROVIDERS } from '../../../../shared/pi-account-projects'
import { piAccountProviderLabel } from './pi-account-provider-label'
import { useManagedAccountProjects } from './use-managed-account-projects'
import { usePiAccountProjects } from './use-pi-account-projects'
import { usePiAccounts } from './use-pi-accounts'

export type ProjectAccountOption = { value: string; label: string }

export type ProjectAccountGroup = {
  /** Provider (Pi bucket) or agent (managed) id; also the React key and test id suffix. */
  key: string
  label: string
  envKey: string
  options: ProjectAccountOption[]
  pinnedValue: string | null
  pinnedLabel: string | null
  /** The account the terminal in this tab actually started on. */
  sessionLabel: (tabId: string) => string | null
  set: (projectPath: string, value: string | null) => Promise<void>
}

/** One "New <agent> with account…" entry; Pi owns two providers, managed agents own one each. */
export type ProjectAccountLaunchEntry = {
  agent: TuiAgent
  label: string
  groups: ProjectAccountGroup[]
}

export type ProjectAccountController = {
  mode: 'pi' | 'managed'
  /** False when this machine's authority has no per-project accounts at all. */
  enabled: boolean
  /** Pi: the installed Pi declares support. Managed: always true once enabled. */
  supported: boolean
  groups: ProjectAccountGroup[]
  launchEntries: ProjectAccountLaunchEntry[]
}

export function managedAgentLabel(agent: ManagedAccountAgent): string {
  return agent === 'claude'
    ? translate('piAccounts.providerClaude', 'Claude')
    : translate('piAccounts.providerCodex', 'Codex')
}

export function projectAccountDefaultLabel(): string {
  return translate('piAccounts.projectDefault', 'Active account (default)')
}

export function piAccountUnsupportedHint(): string {
  return translate('piAccounts.unsupported', "Update ARCA's Pi")
}

export function newAgentWithAccountLabel(agent: TuiAgent): string {
  return agent === 'pi'
    ? translate('piAccounts.newPiWithAccount', 'New Pi with account…')
    : translate('managedAccounts.newWithAccount', 'New {{value0}} with account…', {
        value0: agent === 'claude' ? 'Claude' : 'Codex'
      })
}

/**
 * The project → account choice, from whichever authority owns credentials on this machine: the Pi
 * bucket in `pi` mode, the fork's managed Claude/Codex accounts in `managed` mode. Every surface
 * (project menu, project settings, badges, "New … with account…") reads this one shape, so the
 * source swaps with the mode and the UI does not.
 */
export function useProjectAccounts(projectPath?: string | null): ProjectAccountController {
  const mode = useAgentAuthorityMode()
  const piProjects = usePiAccountProjects(mode === 'pi')
  const piAccounts = usePiAccounts(undefined, mode === 'pi')
  const managed = useManagedAccountProjects(mode === 'managed')
  if (mode === 'pi') {
    const selection = piProjects.selectionFor(projectPath)
    const groups = PI_ACCOUNT_PROVIDERS.map<ProjectAccountGroup>((provider) => ({
      key: provider,
      label: piAccountProviderLabel(provider),
      envKey: piAccountEnvKey(provider),
      options: piAccounts.accounts
        .filter((account) => account.provider === provider)
        .map((account) => ({ value: account.name, label: account.name })),
      pinnedValue: selection[provider] ?? null,
      pinnedLabel: selection[provider] ?? null,
      sessionLabel: (tabId) => piProjects.sessionFor(tabId, provider),
      set: (path, value) => piProjects.setProjectAccount(path, provider, value)
    }))
    return {
      mode,
      enabled: true,
      supported: piProjects.supported,
      groups,
      launchEntries: [{ agent: 'pi', label: newAgentWithAccountLabel('pi'), groups }]
    }
  }
  const selection = managed.selectionFor(projectPath)
  const managedGroup = (agent: ManagedAccountAgent): ProjectAccountGroup => {
    const options = managed.state.accounts
      .filter((account) => account.agent === agent)
      .map((account) => ({ value: account.id, label: account.label }))
    const pinnedValue = selection[agent] ?? null
    return {
      key: agent,
      label: managedAgentLabel(agent),
      envKey: managedAccountEnvKey(agent),
      options,
      pinnedValue,
      pinnedLabel:
        options.find((option) => option.value === pinnedValue)?.label ?? pinnedValue ?? null,
      sessionLabel: (tabId) => managed.sessionFor(tabId, agent),
      set: (path, value) => managed.setProjectAccount(path, agent, value)
    }
  }
  return {
    mode,
    enabled: managed.state.supported,
    supported: managed.state.supported,
    groups: MANAGED_ACCOUNT_AGENTS.map(managedGroup),
    launchEntries: MANAGED_ACCOUNT_AGENTS.map((agent) => ({
      agent,
      label: newAgentWithAccountLabel(agent),
      groups: [managedGroup(agent)]
    }))
  }
}
