import { BrowserWindow, type WebContents } from 'electron'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { isTrustedUIRenderer } from '../ipc/ui'

/**
 * Megamind state reaches the app's own UI only. The Mainframe guest and the login window are
 * BrowserWindows too, and they run remote code, so a plain broadcast would hand the chat, the
 * channel directory and the enrollment status to the very origin this app is a client of.
 */
export function broadcastToTrustedRenderers(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (isTrustedUIRenderer(window.webContents)) {
      window.webContents.send(channel, value)
    }
  }
}

const PENDING_CHAT_LIMIT = 50

/** Tracks which renderer currently claims that the chat is readable. */
export class MegamindChatVisibilityOwner {
  private owner: WebContents | null = null

  constructor(private readonly apply: (visible: boolean, readChannel: string | null) => void) {}

  set(sender: WebContents, visible: boolean, readChannel: string | null): void {
    if (visible) {
      this.owner = sender
      this.apply(true, readChannel)
    } else {
      this.remove(sender)
    }
  }

  remove(sender: WebContents): void {
    if (this.owner !== sender) {
      return
    }
    this.owner = null
    this.apply(false, null)
  }
}

/** Renderers that asked for Megamind notifications; only one of them gets each item. */
export class MegamindSubscribers {
  private senders = new Set<WebContents>()
  private pendingChat: MegamindRecord[] = []
  private chatViewer = ''

  constructor(private readonly onRemove?: (sender: WebContents) => void) {}

  /** True when this is a new subscriber, which is what earns the chat poll a start. */
  add(sender: WebContents): boolean {
    if (!isTrustedUIRenderer(sender) || this.senders.has(sender)) {
      return false
    }
    this.senders.add(sender)
    const remove = (): void => this.removeKnown(sender)
    sender.once('destroyed', remove)
    sender.once('render-process-gone', remove)
    this.deliverPendingChat()
    return true
  }

  remove(sender: WebContents): void {
    if (isTrustedUIRenderer(sender)) {
      this.removeKnown(sender)
    }
  }

  private removeKnown(sender: WebContents): void {
    if (this.senders.delete(sender)) {
      this.onRemove?.(sender)
    }
  }

  /** False when nothing could take the item, so the caller must not acknowledge it. */
  notify(item: MegamindRecord): boolean {
    const target = this.notificationTarget()
    if (!target) {
      return false
    }
    target.send('arcaMegamind:notification', item)
    return true
  }

  /** Chat alerts are transient but survive a closed or reloading app renderer. */
  notifyChat(item: MegamindRecord): boolean {
    if (this.notify(item)) {
      return true
    }
    if (item.kind === 'chat') {
      this.pendingChat.push(item)
      this.pendingChat.splice(0, Math.max(0, this.pendingChat.length - PENDING_CHAT_LIMIT))
    }
    return false
  }

  chatViewerChanged(viewer: string): void {
    if (this.chatViewer && viewer !== this.chatViewer) {
      this.clearPendingChat()
    }
    this.chatViewer = viewer
  }

  clearPendingChat(): void {
    this.pendingChat = []
  }

  private deliverPendingChat(): void {
    const target = this.notificationTarget()
    if (!target) {
      return
    }
    for (const item of this.pendingChat) {
      target.send('arcaMegamind:notification', item)
    }
    this.pendingChat = []
  }

  private notificationTarget(): WebContents | undefined {
    const eligible = [...this.senders].filter(
      (sender) => !sender.isDestroyed() && isTrustedUIRenderer(sender)
    )
    return eligible.find((sender) => sender.isFocused()) ?? eligible[0]
  }
}
