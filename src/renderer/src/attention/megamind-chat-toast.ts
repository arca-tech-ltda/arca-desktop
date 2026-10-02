import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../store'
import type { MegamindRecord } from '../../../shared/arca-megamind'
import { routeMegamindPanel } from './megamind-panel-route'

const BODY_PREVIEW_LENGTH = 180

function bodyPreview(item: MegamindRecord): string {
  const body = typeof item.body === 'string' ? item.body.trim() : ''
  return body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH - 1)}…` : body
}

export function openMegamindConversation(channel: string): void {
  const store = useAppStore.getState()
  store.setActiveView('terminal')
  store.setRightSidebarTab('megamind')
  store.setRightSidebarOpen(true)
  routeMegamindPanel({ channel })
}

export function showMegamindChatToast(item: MegamindRecord, title: string): void {
  const channel = item.channel
  if (typeof channel !== 'string') {
    return
  }
  toast(title, {
    description: bodyPreview(item),
    action: {
      label: translate('arca.megamind.openConversation', 'Open conversation'),
      onClick: () => openMegamindConversation(channel)
    }
  })
}
