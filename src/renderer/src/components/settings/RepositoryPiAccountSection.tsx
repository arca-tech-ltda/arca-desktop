import React from 'react'
import type { Repo } from '../../../../shared/repo-types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SearchableSetting } from './SearchableSetting'
import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'
import {
  isPiAccountSelectableProject,
  PI_ACCOUNT_PROVIDERS
} from '../../../../shared/pi-account-projects'
import { usePiAccounts } from './use-pi-accounts'
import { usePiAccountProjects } from './use-pi-account-projects'
import { useAgentAuthorityMode } from '@/store/agent-authority'
import {
  piAccountDefaultLabel,
  piAccountProviderLabel,
  piAccountUnsupportedHint
} from './pi-account-project-menu'

// Why: Radix Select rejects an empty item value, so "follow the active account" needs a sentinel.
const DEFAULT_VALUE = '__pi_active_account__'

export function RepositoryPiAccountSection({
  repo,
  forceVisible
}: {
  repo: Repo
  forceVisible?: boolean
}): React.JSX.Element | null {
  const agentAuthority = useAgentAuthorityMode()
  const projects = usePiAccountProjects()
  const accounts = usePiAccounts()
  const selection = projects.selectionFor(repo.path)
  if (agentAuthority !== 'pi') {
    // A partner's machine has no Pi bucket to pin a project to.
    return null
  }
  if (!isPiAccountSelectableProject({ connectionId: repo.connectionId, path: repo.path })) {
    // SSH and WSL projects run Pi on the other host, where the choice belongs to its own /accounts.
    return null
  }
  const title = translate('piAccounts.projectSectionTitle', 'Pi Account')
  return (
    <SearchableSetting
      title={title}
      description={translate(
        'piAccounts.projectSectionDescription',
        'Always open Pi in this project with a specific saved account.'
      )}
      keywords={searchKeywords([
        repo.displayName,
        'pi account',
        'claude',
        'codex',
        { key: 'piAccounts.projectSectionKeyword', fallback: 'pi account per project' }
      ])}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground">
          {projects.supported
            ? translate(
                'piAccounts.projectSectionLongDescription',
                'Pi terminals opened in this project use the chosen account. Terminals already open keep the account they started with.'
              )
            : translate(
                'piAccounts.projectSectionUnsupported',
                "The installed Pi does not support per-project accounts yet. Update ARCA's Pi to enable this."
              )}
        </p>
      </div>
      {PI_ACCOUNT_PROVIDERS.map((provider) => {
        const providerAccounts = accounts.accounts.filter(
          (account) => account.provider === provider
        )
        const chosen = selection[provider]
        return (
          <div key={provider} className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              {piAccountProviderLabel(provider)}
            </span>
            <Select
              value={chosen ?? DEFAULT_VALUE}
              disabled={!projects.supported}
              onValueChange={(value) =>
                void projects.setProjectAccount(
                  repo.path,
                  provider,
                  value === DEFAULT_VALUE ? null : value
                )
              }
            >
              <SelectTrigger
                aria-label={piAccountProviderLabel(provider)}
                data-testid={`pi-account-project-select-${provider}`}
              >
                <SelectValue
                  placeholder={
                    projects.supported ? piAccountDefaultLabel() : piAccountUnsupportedHint()
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_VALUE}>{piAccountDefaultLabel()}</SelectItem>
                {providerAccounts.map((account) => (
                  <SelectItem key={account.name} value={account.name}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </SearchableSetting>
  )
}
