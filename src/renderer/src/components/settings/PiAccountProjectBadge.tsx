import React from 'react'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PI_ACCOUNT_PROVIDERS } from '../../../../shared/pi-account-projects'
import { usePiAccountProjects } from './use-pi-account-projects'
import { piAccountProviderLabel } from './pi-account-project-menu'

/** Discreet marker beside a project name, shown only when that project has a fixed account. */
export function PiAccountProjectBadge({
  projectPath
}: {
  projectPath: string
}): React.JSX.Element | null {
  const projects = usePiAccountProjects()
  const selection = projects.selectionFor(projectPath)
  const pinned = PI_ACCOUNT_PROVIDERS.filter((provider) => selection[provider])
  if (!projects.supported || pinned.length === 0) {
    return null
  }
  const names = pinned.map((provider) => selection[provider]).join(' · ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="pi-account-project-badge" className="max-w-32 truncate">
          <Badge variant="outline">{names}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {pinned
          .map((provider) =>
            translate('piAccounts.projectBadgeLine', '{{value0}}: {{value1}}', {
              value0: piAccountProviderLabel(provider),
              value1: selection[provider] ?? ''
            })
          )
          .join('\n')}
      </TooltipContent>
    </Tooltip>
  )
}
