import { useAppStore } from '../store'
import { translate } from '@/i18n/i18n'
import { revealRepoInProjectFilter } from '@/components/sidebar/project-filter-reveal'
import type { ArcaDeepLink } from '../../../shared/arca-deep-link'
import { MegamindNotificationDedup } from '../../../shared/arca-megamind-notifications'
import type { MegamindPanelRoute, MegamindRecord } from '../../../shared/arca-megamind'
import { routeMegamindPanel } from './megamind-panel-route'
import {
  megamindApprovalsSnapshot,
  startMegamindApprovalsPolling,
  subscribeMegamindApprovals
} from './megamind-approvals-store'

const dedup = new MegamindNotificationDedup()
let pendingApprovalId: string | undefined
export function megamindApprovalTarget(): string | undefined {
  return pendingApprovalId
}

function chatNotificationTitle(item: MegamindRecord): string {
  const author = typeof item.author === 'string' ? item.author : ''
  return item.alert === 'dm'
    ? translate('arca.megamind.chatDirectMessage', 'Direct message from {{author}}', { author })
    : translate('arca.megamind.chatMention', '{{author}} mentioned you', { author })
}

function notificationRoute(item: MegamindRecord): MegamindPanelRoute {
  if (item.kind === 'chat') {
    return {
      tab: 'chat',
      ...(typeof item.channel === 'string' ? { channel: item.channel } : {})
    }
  }
  return {
    tab: 'approvals',
    ...(item.kind === 'approval_pending' && typeof item.id === 'string'
      ? { approvalId: item.id }
      : {})
  }
}

export function announceMegamind(item: MegamindRecord): void {
  if (!dedup.accept(item)) {
    return
  }
  const title =
    item.kind === 'chat'
      ? chatNotificationTitle(item)
      : item.kind === 'approval_pending'
        ? translate('arca.megamind.approvalPending', 'Approval pending')
        : item.kind === 'approval_decision'
          ? translate('arca.megamind.approvalDecided', 'Approval decided')
          : item.kind === 'request'
            ? translate('arca.megamind.requestReceived', 'Request received')
            : item.status === 'failed'
              ? translate('arca.megamind.requestFailed', 'Request failed')
              : translate('arca.megamind.requestCompleted', 'Request completed')
  const body =
    typeof item.body === 'string'
      ? item.body
      : typeof item.title === 'string'
        ? item.title
        : typeof item.summary === 'string'
          ? item.summary
          : ''
  void window.api.notifications
    .dispatch({
      source: 'agent-task-complete',
      notificationId: `megamind:${item.kind}:${item.id}:${item.status ?? ''}`,
      worktreeLabel: `megamind:${item.id}`,
      megamind: { title, body, route: notificationRoute(item) }
    })
    .catch(() => {})
}

function navigate(link: ArcaDeepLink): boolean {
  const store = useAppStore.getState()
  if (link.kind === 'megamind') {
    store.setActiveView('terminal')
    store.setRightSidebarTab('megamind')
    store.setRightSidebarOpen(true)
    pendingApprovalId = link.approvalId
    routeMegamindPanel({
      tab: link.approvalId ? 'approvals' : 'chat',
      ...(link.approvalId ? { approvalId: link.approvalId } : {})
    })
    if (link.approvalId) {
      window.dispatchEvent(new CustomEvent('arca-megamind-approval', { detail: link.approvalId }))
    }
    return true
  }
  const name = link.repo.toLowerCase()
  const matches = store.repos.filter((repo) =>
    [
      repo.displayName,
      repo.path.split(/[\\/]/).pop(),
      repo.gitRemoteIdentity?.canonicalKey.split('/').pop()
    ].some((candidate) => candidate?.toLowerCase() === name)
  )
  // Ambiguous names must not select an arbitrary execution host.
  if (matches.length !== 1) {
    return matches.length > 1
  }
  store.setActiveRepo(matches[0].id)
  revealRepoInProjectFilter(store, matches[0].id)
  store.setSidebarOpen(true)
  if (link.kind === 'task') {
    store.openTaskPage({ preselectedRepoId: matches[0].id })
  } else {
    store.setActiveView('terminal')
  }
  return true
}

export function registerMegamindEvents(): () => void {
  const api = window.api.arcaMegamind
  if (!api) {
    return () => {}
  }
  let disposed = false
  let pending: ArcaDeepLink[] = []
  let unsubscribeCatalog: (() => void) | undefined
  let expiry: ReturnType<typeof setTimeout> | undefined
  const clearPending = (): void => {
    pending = []
    unsubscribeCatalog?.()
    unsubscribeCatalog = undefined
    clearTimeout(expiry)
  }
  const consume = (): void => {
    void api
      .takeDeepLinks()
      .then((links) => {
        if (disposed) {
          return
        }
        pending.push(...links.filter((link) => !navigate(link)))
        pending = pending.slice(-50)
        if (pending.length && !unsubscribeCatalog) {
          // Cold-start links wait for the registered repository catalog, never a filesystem scan.
          unsubscribeCatalog = useAppStore.subscribe((state, previous) => {
            if (state.repos === previous.repos) {
              return
            }
            pending = pending.filter((link) => !navigate(link))
            if (!pending.length) {
              clearPending()
            }
          })
          expiry = setTimeout(clearPending, 60_000)
        }
      })
      .catch(() => {})
  }
  const offLinks = api.onDeepLink(consume)
  const offNotifications = api.onNotification(announceMegamind)
  // Approvals are polled app-wide so the notification does not wait for the panel to be opened.
  const offApprovals = subscribeMegamindApprovals(() => {
    for (const approval of megamindApprovalsSnapshot().items) {
      if (approval.relevant) {
        announceMegamind({ ...approval, kind: 'approval_pending' })
      }
    }
  })
  const stopApprovalsPolling = startMegamindApprovalsPolling()
  consume()
  return () => {
    disposed = true
    clearPending()
    offLinks()
    offNotifications()
    offApprovals()
    stopApprovalsPolling()
  }
}
