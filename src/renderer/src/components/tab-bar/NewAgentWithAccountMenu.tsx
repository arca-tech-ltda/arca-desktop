import React from 'react'
import { UserRound } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { usePiAccountSelectableWorkspace } from '@/components/settings/use-pi-account-projects'
import {
  piAccountUnsupportedHint,
  useProjectAccounts,
  type ProjectAccountGroup,
  type ProjectAccountLaunchEntry
} from '@/components/settings/use-project-accounts'
import type { TuiAgent } from '../../../../shared/tui-agent'

/**
 * Opens an agent terminal on a chosen account for this session only, without touching the project
 * mapping. Also the "use another account in this session" exit from a tab whose account is dead.
 */
export function NewAgentWithAccountMenu({
  worktreeId,
  groupId,
  onLaunched
}: {
  worktreeId: string
  groupId?: string
  onLaunched?: () => void
}): React.JSX.Element | null {
  const accounts = useProjectAccounts()
  const selectable = usePiAccountSelectableWorkspace(worktreeId)
  if (!accounts.enabled) {
    return null
  }
  if (!selectable) {
    // SSH and WSL terminals run the other host's agent; an account of this computer means nothing.
    return null
  }
  if (!accounts.supported) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled data-testid="new-pi-with-account">
          <UserRound className="size-3.5 shrink-0" />
          {accounts.launchEntries[0]?.label}
          <span className="ml-auto pl-2 text-muted-foreground">{piAccountUnsupportedHint()}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent />
      </DropdownMenuSub>
    )
  }
  return (
    <>
      {accounts.launchEntries.map((entry) => (
        <LaunchEntrySubmenu
          key={entry.agent}
          entry={entry}
          worktreeId={worktreeId}
          {...(groupId ? { groupId } : {})}
          {...(onLaunched ? { onLaunched } : {})}
        />
      ))}
    </>
  )
}

function LaunchEntrySubmenu({
  entry,
  worktreeId,
  groupId,
  onLaunched
}: {
  entry: ProjectAccountLaunchEntry
  worktreeId: string
  groupId?: string
  onLaunched?: () => void
}): React.JSX.Element {
  // Loaded on demand: the agent launcher pulls the whole agent catalog into this menu otherwise.
  const launch = (agent: TuiAgent, envKey: string, value: string): void => {
    void import('@/lib/launch-agent-in-new-tab').then(({ launchAgentInNewTab }) => {
      launchAgentInNewTab({
        agent,
        worktreeId,
        ...(groupId ? { groupId } : {}),
        agentEnvOverrides: { [envKey]: value },
        launchSource: 'tab_bar_quick_launch'
      })
      onLaunched?.()
    })
  }
  const single = entry.groups.length === 1 ? entry.groups[0] : null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="new-pi-with-account">
        <UserRound className="size-3.5 shrink-0" />
        {entry.label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {single ? (
          <AccountItems
            group={single}
            onSelect={(value) => launch(entry.agent, single.envKey, value)}
          />
        ) : (
          entry.groups.map((group) => (
            <DropdownMenuSub key={group.key}>
              <DropdownMenuSubTrigger>{group.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <AccountItems
                  group={group}
                  onSelect={(value) => launch(entry.agent, group.envKey, value)}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function AccountItems({
  group,
  onSelect
}: {
  group: ProjectAccountGroup
  onSelect: (value: string) => void
}): React.JSX.Element {
  if (group.options.length === 0) {
    return (
      <DropdownMenuItem disabled>
        {translate('piAccounts.noAccounts', 'No saved accounts')}
      </DropdownMenuItem>
    )
  }
  return (
    <>
      {group.options.map((option) => (
        <DropdownMenuItem key={option.value} onSelect={() => onSelect(option.value)}>
          <span className="max-w-48 truncate">{option.label}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}
