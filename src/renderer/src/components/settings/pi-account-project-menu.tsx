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
import type { PiAccountProvider } from '../../../../shared/pi-accounts'
import { PI_ACCOUNT_PROVIDERS } from '../../../../shared/pi-account-projects'
import { usePiAccounts } from './use-pi-accounts'
import { usePiAccountProjects } from './use-pi-account-projects'

export function piAccountProviderLabel(provider: PiAccountProvider): string {
  return provider === 'anthropic'
    ? translate('piAccounts.providerClaude', 'Claude')
    : translate('piAccounts.providerCodex', 'Codex')
}

export function piAccountDefaultLabel(): string {
  return translate('piAccounts.projectDefault', 'Active account (default)')
}

export function piAccountUnsupportedHint(): string {
  return translate('piAccounts.unsupported', "Update ARCA's Pi")
}

/**
 * "Account" submenu for a project: one provider submenu each, with the fixed account checked.
 * Same choice as Project Settings — both write `account-projects.json` through the shared hook.
 */
export function PiAccountProjectSubmenu({
  projectPath
}: {
  projectPath: string
}): React.JSX.Element {
  const projects = usePiAccountProjects()
  const accounts = usePiAccounts()
  const selection = projects.selectionFor(projectPath)
  const label = translate('piAccounts.projectMenu', 'Account')
  if (!projects.supported) {
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
        {PI_ACCOUNT_PROVIDERS.map((provider) => {
          const providerAccounts = accounts.accounts.filter(
            (account) => account.provider === provider
          )
          const chosen = selection[provider]
          return (
            <DropdownMenuSub key={provider}>
              <DropdownMenuSubTrigger>
                <span className="flex-1">{piAccountProviderLabel(provider)}</span>
                {chosen ? (
                  <span className="max-w-32 truncate pl-2 text-muted-foreground">{chosen}</span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={!chosen}
                  onSelect={() => void projects.setProjectAccount(projectPath, provider, null)}
                >
                  {piAccountDefaultLabel()}
                </DropdownMenuCheckboxItem>
                {providerAccounts.length > 0 ? <DropdownMenuSeparator /> : null}
                {providerAccounts.map((account) => (
                  <DropdownMenuCheckboxItem
                    key={account.name}
                    checked={chosen === account.name}
                    onSelect={() =>
                      void projects.setProjectAccount(projectPath, provider, account.name)
                    }
                  >
                    <span className="max-w-48 truncate">{account.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
