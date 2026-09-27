import type { PiAccount } from '../../../../shared/pi-accounts'

/**
 * Anchor for "Projects using this account". The project → account mapping is not wired yet, so
 * this renders nothing; the row layout already reserves its place.
 */
export function PiAccountProjectsSlot(_props: { account: PiAccount }): React.JSX.Element | null {
  return null
}
