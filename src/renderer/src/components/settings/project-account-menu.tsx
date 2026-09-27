import React from 'react'
import { UserRound } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { isLocalAccountSelectableProject } from '../../../../shared/project-account-paths'
import {
  piAccountUnsupportedHint,
  projectAccountDefaultLabel,
  useProjectAccounts,
  type ProjectAccountGroup
} from './use-project-accounts'

export { piAccountUnsupportedHint, projectAccountDefaultLabel } from './use-project-accounts'

/**
 * "Account" submenu for a project: one submenu per provider (Pi) or per agent (managed Claude
 * Code/Codex), with the fixed account checked. Same choice as Project Settings — both write the
 * map of whichever authority owns accounts on this machine.
 */
export function ProjectAccountSubmenu({
  projectPath,
  connectionId
}: {
  projectPath: string
  connectionId?: string | null
}): React.JSX.Element | null {
  const accounts = useProjectAccounts(projectPath)
  const label = translate('piAccounts.projectMenu', 'Account')
  if (!accounts.enabled) {
    return null
  }
  if (!isLocalAccountSelectableProject({ connectionId, path: projectPath })) {
    // SSH and WSL projects run the agent on the other host, which owns that choice.
    return null
  }
  if (!accounts.supported) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled data-testid="pi-account-project-submenu">
          <UserRound className="size-3.5" />
          {label}
          <span className="ml-auto pl-2 text-muted-foreground">{piAccountUnsupportedHint()}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent />
      </DropdownMenuSub>
    )
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="pi-account-project-submenu">
        <UserRound className="size-3.5" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {accounts.groups.map((group) => (
          <ProjectAccountGroupSubmenu key={group.key} group={group} projectPath={projectPath} />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ProjectAccountGroupSubmenu({
  group,
  projectPath
}: {
  group: ProjectAccountGroup
  projectPath: string
}): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{group.label}</span>
        {group.pinnedLabel ? (
          <span className="max-w-32 truncate pl-2 text-muted-foreground">{group.pinnedLabel}</span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem
          checked={!group.pinnedValue}
          onSelect={() => void group.set(projectPath, null)}
        >
          {projectAccountDefaultLabel()}
        </DropdownMenuCheckboxItem>
        {group.options.length > 0 ? <DropdownMenuSeparator /> : null}
        {group.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={group.pinnedValue === option.value}
            onSelect={() => void group.set(projectPath, option.value)}
          >
            <span className="max-w-48 truncate">{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
