import { MoreHorizontal } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { PiAccount } from '../../../../shared/pi-accounts'
import type { PiAccountUsage, PiAccountUsageSample } from '../../../../shared/pi-account-usage'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { PiAccountProjectsSlot } from './PiAccountProjectsSlot'
import { PiAccountUsageBars } from './PiAccountUsageBars'
import { PiAccountUsageHistoryChart } from './PiAccountUsageHistoryChart'

export function PiAccountRow({
  account,
  usage,
  history,
  busy,
  onUse,
  onRename,
  onRemove
}: {
  account: PiAccount
  usage: PiAccountUsage | undefined
  history: PiAccountUsageSample[]
  busy: boolean
  onUse: () => void
  onRename: () => void
  onRemove: () => void
}): React.JSX.Element {
  const email = usage?.email && usage.email !== account.name ? usage.email : null
  return (
    <div className="space-y-2 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium" title={account.name}>
              {account.name}
            </span>
            {account.active ? (
              <Badge variant="secondary">{translate('piAccounts.active', 'Active')}</Badge>
            ) : null}
          </div>
          {email ? (
            <p className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
          ) : null}
          {account.drift ? (
            <p className="text-xs text-muted-foreground">
              {translate('piAccounts.drift', 'Pi refreshed this token; Use syncs it.')}
            </p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              aria-label={translate('piAccounts.accountActions', 'Actions for {{value0}}', {
                value0: account.name
              })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={account.active && !account.drift} onSelect={() => onUse()}>
              {translate('piAccounts.use', 'Use')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRename()}>
              {translate('piAccounts.rename', 'Rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove()}>
              {translate('piAccounts.remove', 'Remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PiAccountUsageBars usage={usage} />
      <PiAccountUsageHistoryChart samples={history} />
      <PiAccountProjectsSlot account={account} />
    </div>
  )
}
