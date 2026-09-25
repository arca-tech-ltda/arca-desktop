import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { PiAccount } from '../../../../shared/pi-accounts'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Input } from '../ui/input'

export function RemovePiAccountDialog({
  target,
  blocked,
  onCancel,
  onConfirm
}: {
  target: PiAccount | null
  /** Active account with siblings: Pi's slot would be left without an owner, so switch first. */
  blocked: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {translate('piAccounts.removeTitle', 'Remove {{value0}}?', {
              value0: target ? `${target.provider} / ${target.name}` : ''
            })}
          </DialogTitle>
          <DialogDescription>
            {blocked
              ? translate(
                  'piAccounts.removeBlocked',
                  'This account is in use. Choose another account with Use first, then remove this one.'
                )
              : target?.active
                ? translate(
                    'piAccounts.removeActive',
                    'This is the account Pi is using. Removing it only drops it from the saved list; Pi keeps the current sign-in until you add and use another account.'
                  )
                : translate(
                    'piAccounts.removeBody',
                    'Removes this account from the saved list. The sign-in itself stays valid; you can add it again.'
                  )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('piAccounts.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={blocked} onClick={onConfirm}>
            {translate('piAccounts.remove', 'Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RenamePiAccountDialog({
  target,
  error,
  onCancel,
  onConfirm
}: {
  target: PiAccount | null
  error: string | null
  onCancel: () => void
  onConfirm: (name: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={() => setName(target?.name ?? '')}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{translate('piAccounts.renameTitle', 'Rename account')}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          aria-label={translate('piAccounts.name', 'Account name')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onConfirm(name)
            }
          }}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('piAccounts.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => onConfirm(name)}>{translate('piAccounts.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
