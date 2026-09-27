import { useEffect } from 'react'
import { translate } from '@/i18n/i18n'
import {
  normalizeAgentAuthorityPreference,
  type AgentAuthorityState
} from '../../../../shared/agent-authority'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { refreshAgentAuthority } from '@/store/agent-authority'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSegmentedControl } from './SettingsFormControls'
import { getAccountsAgentAuthoritySearchEntries } from './accounts-search'

type AgentAuthoritySectionProps = {
  authority: AgentAuthorityState
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

function statusText(authority: AgentAuthorityState): string {
  if (authority.preference === 'pi') {
    return translate('arca.agentAuthority.statusForcedPi', 'Forced to Pi on this computer.')
  }
  if (authority.preference === 'managed') {
    return translate(
      'arca.agentAuthority.statusForcedManaged',
      'Forced to Claude Code and Codex on this computer.'
    )
  }
  if (!authority.resolved) {
    return translate('arca.agentAuthority.statusChecking', 'Checking whether Pi answers here…')
  }
  return authority.mode === 'pi'
    ? translate(
        'arca.agentAuthority.statusAutoPi',
        'Pi is installed with account support, so Pi owns the accounts here.'
      )
    : translate(
        'arca.agentAuthority.statusAutoManaged',
        'No Pi with account support found, so Claude Code and Codex own the accounts here.'
      )
}

/** Picks who owns agent credentials on this computer; the accounts screen follows the result. */
export function AgentAuthoritySection({
  authority,
  settings,
  updateSettings
}: AgentAuthoritySectionProps): React.JSX.Element | null {
  // Pi can be installed or removed while the app runs; opening this screen re-asks.
  useEffect(() => refreshAgentAuthority(), [])
  const preference = normalizeAgentAuthorityPreference(settings.agentAuthority)
  const label = translate('arca.agentAuthority.label', 'Account owner')
  return (
    <SearchableSetting {...getAccountsAgentAuthoritySearchEntries()[0]}>
      <section id="accounts-agent-authority" className="space-y-3 scroll-mt-6">
        <SettingsRow
          label={label}
          alignTop
          description={`${translate(
            'arca.agentAuthority.description',
            'Which agent owns the accounts on this computer: Pi, or the Claude Code and Codex logins ARCA manages. Automatic picks Pi only where Pi answers with account support.'
          )} ${statusText(authority)}`}
          control={
            <SettingsSegmentedControl
              ariaLabel={label}
              value={preference}
              onChange={(value) => updateSettings({ agentAuthority: value })}
              equalWidth
              options={[
                {
                  value: 'auto',
                  label: translate('arca.agentAuthority.optionAuto', 'Automatic')
                },
                { value: 'pi', label: translate('arca.agentAuthority.optionPi', 'Pi') },
                {
                  value: 'managed',
                  label: translate('arca.agentAuthority.optionManaged', 'Claude & Codex')
                }
              ]}
            />
          }
        />
      </section>
    </SearchableSetting>
  )
}
