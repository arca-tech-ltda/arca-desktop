import type { UpdateCheckOptions } from '../../../shared/update-status-types'

type UpdateCheckClickEvent = Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

export function getUpdateCheckHint(_isMac?: boolean): string {
  return 'Mainframe ARCA · stable'
}

export function getUpdateCheckClickOptions(
  _event: UpdateCheckClickEvent,
  _isMac?: boolean
): UpdateCheckOptions {
  return {}
}
