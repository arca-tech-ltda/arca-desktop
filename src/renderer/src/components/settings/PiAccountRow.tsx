import { translate } from '@/i18n/i18n'
import type { PiAccount } from '../../../../shared/pi-accounts'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

export function PiAccountRow({
  account,
  busy,
  onUse,
  onRename,
  onRemove
}: {
  account: PiAccount
  busy: boolean
  onUse: () => void
  onRename: () => void
  onRemove: () => void
}): React.JSX.Element {
  const label = `${account.provider} / ${account.name}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 grow basis-40 truncate text-sm" title={label}>
        {label}
      </span>
      {account.active ? (
        <Badge variant="secondary" className="shrink-0">
          {translate('piAccounts.active', 'Active')}
        </Badge>
      ) : null}
      {account.drift ? (
        <span className="min-w-0 text-xs text-muted-foreground">
          {translate('piAccounts.drift', 'Pi refreshed this token; Use syncs it.')}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" disabled={busy} onClick={onUse}>
          {translate('piAccounts.use', 'Use')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onRename}
          aria-label={translate('piAccounts.renameAccount', 'Rename {{value0}}', {
            value0: label
          })}
        >
          {translate('piAccounts.rename', 'Rename')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onRemove}
          aria-label={translate('piAccounts.removeAccount', 'Remove {{value0}}', {
            value0: label
          })}
        >
          {translate('piAccounts.remove', 'Remove')}
        </Button>
      </div>
    </div>
  )
}
