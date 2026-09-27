import React from 'react'
import { UserRound } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { piAccountEnvKey, PI_ACCOUNT_PROVIDERS } from '../../../../shared/pi-account-projects'
import { usePiAccounts } from '@/components/settings/use-pi-accounts'
import {
  usePiAccountProjects,
  usePiAccountSelectableWorkspace
} from '@/components/settings/use-pi-account-projects'
import {
  piAccountProviderLabel,
  piAccountUnsupportedHint
} from '@/components/settings/pi-account-project-menu'

export function newPiWithAccountLabel(): string {
  return translate('piAccounts.newPiWithAccount', 'New Pi with account…')
}

/**
 * Opens a Pi terminal on a chosen account for this session only, without touching the project
 * mapping. Also the "use another account in this session" exit from a tab whose account is dead.
 */
export function NewPiWithAccountMenu({
  worktreeId,
  groupId,
  onLaunched
}: {
  worktreeId: string
  groupId?: string
  onLaunched?: () => void
}): React.JSX.Element | null {
  const projects = usePiAccountProjects()
  const accounts = usePiAccounts()
  const selectable = usePiAccountSelectableWorkspace(worktreeId)
  if (!selectable) {
    // SSH and WSL terminals run the other host's Pi; a name from this bucket means nothing there.
    return null
  }
  if (!projects.supported) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled data-testid="new-pi-with-account">
          <UserRound className="size-3.5 shrink-0" />
          {newPiWithAccountLabel()}
          <span className="ml-auto pl-2 text-muted-foreground">{piAccountUnsupportedHint()}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent />
      </DropdownMenuSub>
    )
  }
  // Loaded on demand: the agent launcher pulls the whole agent catalog into this menu otherwise.
  const launch = (provider: (typeof PI_ACCOUNT_PROVIDERS)[number], name: string): void => {
    void import('@/lib/launch-agent-in-new-tab').then(({ launchAgentInNewTab }) => {
      launchAgentInNewTab({
        agent: 'pi',
        worktreeId,
        ...(groupId ? { groupId } : {}),
        agentEnvOverrides: { [piAccountEnvKey(provider)]: name },
        launchSource: 'tab_bar_quick_launch'
      })
      onLaunched?.()
    })
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="new-pi-with-account">
        <UserRound className="size-3.5 shrink-0" />
        {newPiWithAccountLabel()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {PI_ACCOUNT_PROVIDERS.map((provider) => {
          const providerAccounts = accounts.accounts.filter(
            (account) => account.provider === provider
          )
          return (
            <DropdownMenuSub key={provider}>
              <DropdownMenuSubTrigger>{piAccountProviderLabel(provider)}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {providerAccounts.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {translate('piAccounts.noAccounts', 'No saved accounts')}
                  </DropdownMenuItem>
                ) : (
                  providerAccounts.map((account) => (
                    <DropdownMenuItem
                      key={account.name}
                      onSelect={() => launch(provider, account.name)}
                    >
                      <span className="max-w-48 truncate">{account.name}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
