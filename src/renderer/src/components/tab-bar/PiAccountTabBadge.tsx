import React from 'react'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PI_ACCOUNT_PROVIDERS } from '../../../../shared/pi-account-projects'
import { usePiAccountProjects } from '@/components/settings/use-pi-account-projects'
import { piAccountProviderLabel } from '@/components/settings/pi-account-project-menu'
import { newPiWithAccountLabel } from './NewPiWithAccountMenu'

/** The account this terminal actually started on; a later mapping change does not move it. */
export function PiAccountTabBadge({ tabId }: { tabId: string }): React.JSX.Element | null {
  const projects = usePiAccountProjects()
  const running = PI_ACCOUNT_PROVIDERS.map((provider) => ({
    provider,
    name: projects.sessionFor(tabId, provider)
  })).filter((entry) => entry.name)
  if (running.length === 0) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="pi-account-tab-badge"
          className="mr-1 max-w-16 shrink-0 truncate text-[10px] text-muted-foreground"
        >
          {running.map((entry) => entry.name).join(' · ')}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-80 whitespace-pre-wrap">
        {`${running
          .map((entry) =>
            translate('piAccounts.projectBadgeLine', '{{value0}}: {{value1}}', {
              value0: piAccountProviderLabel(entry.provider),
              value1: entry.name ?? ''
            })
          )
          .join('\n')}\n${translate(
          'piAccounts.useAnotherAccount',
          'Use another account in this session: right-click this tab → {{value0}}',
          { value0: newPiWithAccountLabel() }
        )}`}
      </TooltipContent>
    </Tooltip>
  )
}
