import React from 'react'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProjectAccounts } from './use-project-accounts'

/** Discreet marker beside a project name, shown only when that project has a fixed account. */
export function ProjectAccountBadge({
  projectPath
}: {
  projectPath: string
}): React.JSX.Element | null {
  const accounts = useProjectAccounts(projectPath)
  const pinned = accounts.groups.filter((group) => group.pinnedValue)
  if (!accounts.enabled || !accounts.supported || pinned.length === 0) {
    return null
  }
  const names = pinned.map((group) => group.pinnedLabel).join(' · ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="pi-account-project-badge" className="max-w-32 truncate">
          <Badge variant="outline">{names}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {pinned
          .map((group) =>
            translate('piAccounts.projectBadgeLine', '{{value0}}: {{value1}}', {
              value0: group.label,
              value1: group.pinnedLabel ?? ''
            })
          )
          .join('\n')}
      </TooltipContent>
    </Tooltip>
  )
}
