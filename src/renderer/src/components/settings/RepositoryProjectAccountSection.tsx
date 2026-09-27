import React from 'react'
import type { Repo } from '../../../../shared/repo-types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SearchableSetting } from './SearchableSetting'
import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'
import { isLocalAccountSelectableProject } from '../../../../shared/project-account-paths'
import {
  piAccountUnsupportedHint,
  projectAccountDefaultLabel,
  useProjectAccounts
} from './use-project-accounts'

// Why: Radix Select rejects an empty item value, so "follow the active account" needs a sentinel.
const DEFAULT_VALUE = '__pi_active_account__'

export function RepositoryProjectAccountSection({
  repo,
  forceVisible
}: {
  repo: Repo
  forceVisible?: boolean
}): React.JSX.Element | null {
  const accounts = useProjectAccounts(repo.path)
  if (!accounts.enabled) {
    return null
  }
  if (!isLocalAccountSelectableProject({ connectionId: repo.connectionId, path: repo.path })) {
    // SSH and WSL projects run the agent on the other host, which owns that choice.
    return null
  }
  const pi = accounts.mode === 'pi'
  const title = pi
    ? translate('piAccounts.projectSectionTitle', 'Pi Account')
    : translate('managedAccounts.projectSectionTitle', 'Agent Account')
  return (
    <SearchableSetting
      title={title}
      description={
        pi
          ? translate(
              'piAccounts.projectSectionDescription',
              'Always open Pi in this project with a specific saved account.'
            )
          : translate(
              'managedAccounts.projectSectionDescription',
              'Always open Claude Code or Codex in this project with a specific account.'
            )
      }
      keywords={searchKeywords([
        repo.displayName,
        'pi account',
        'claude',
        'codex',
        { key: 'piAccounts.projectSectionKeyword', fallback: 'pi account per project' },
        { key: 'managedAccounts.projectSectionKeyword', fallback: 'agent account per project' }
      ])}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground">{sectionExplanation(pi, accounts.supported)}</p>
      </div>
      {accounts.groups.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{group.label}</span>
          <Select
            value={group.pinnedValue ?? DEFAULT_VALUE}
            disabled={!accounts.supported}
            onValueChange={(value) =>
              void group.set(repo.path, value === DEFAULT_VALUE ? null : value)
            }
          >
            <SelectTrigger
              aria-label={group.label}
              data-testid={`pi-account-project-select-${group.key}`}
            >
              <SelectValue
                placeholder={
                  accounts.supported ? projectAccountDefaultLabel() : piAccountUnsupportedHint()
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_VALUE}>{projectAccountDefaultLabel()}</SelectItem>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </SearchableSetting>
  )
}

function sectionExplanation(pi: boolean, supported: boolean): string {
  if (!pi) {
    return translate(
      'managedAccounts.projectSectionLongDescription',
      'Claude Code and Codex terminals opened in this project use the chosen account. Terminals already open keep the account they started with.'
    )
  }
  return supported
    ? translate(
        'piAccounts.projectSectionLongDescription',
        'Pi terminals opened in this project use the chosen account. Terminals already open keep the account they started with.'
      )
    : translate(
        'piAccounts.projectSectionUnsupported',
        "The installed Pi does not support per-project accounts yet. Update ARCA's Pi to enable this."
      )
}
