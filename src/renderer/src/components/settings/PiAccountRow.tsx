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
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 break-words text-sm">{label}</span>
      {account.active ? (
        <Badge variant="secondary">{translate('piAccounts.active', 'Active')}</Badge>
      ) : null}
      {account.drift ? (
        <span className="text-xs text-muted-foreground">
          {translate('piAccounts.drift', 'Pi refreshed this token; Use syncs it.')}
        </span>
      ) : null}
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
  )
}
