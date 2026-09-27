import React from 'react'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  newAgentWithAccountLabel,
  useProjectAccounts
} from '@/components/settings/use-project-accounts'

/** The account this terminal actually started on; a later mapping change does not move it. */
export function ProjectAccountTabBadge({ tabId }: { tabId: string }): React.JSX.Element | null {
  const accounts = useProjectAccounts()
  const running = accounts.groups
    .map((group) => ({ group, name: group.sessionLabel(tabId) }))
    .filter((entry) => entry.name)
  if (running.length === 0) {
    return null
  }
  const exit = accounts.launchEntries.find((entry) =>
    entry.groups.some((group) => group.key === running[0]?.group.key)
  )
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
              value0: entry.group.label,
              value1: entry.name ?? ''
            })
          )
          .join('\n')}\n${translate(
          'piAccounts.useAnotherAccount',
          'Use another account in this session: right-click this tab → {{value0}}',
          { value0: exit?.label ?? newAgentWithAccountLabel('pi') }
        )}`}
      </TooltipContent>
    </Tooltip>
  )
}
