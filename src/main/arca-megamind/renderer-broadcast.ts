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

/** Renderers that asked for Megamind notifications; only one of them gets each item. */
export class MegamindSubscribers {
  private senders = new Set<WebContents>()

  /** True when this is a new subscriber, which is what earns the chat poll a start. */
  add(sender: WebContents): boolean {
    if (!isTrustedUIRenderer(sender) || this.senders.has(sender)) {
      return false
    }
    this.senders.add(sender)
    sender.once('destroyed', () => this.senders.delete(sender))
    sender.once('render-process-gone', () => this.senders.delete(sender))
    return true
  }

  remove(sender: WebContents): void {
    if (isTrustedUIRenderer(sender)) {
      this.senders.delete(sender)
    }
  }

  /** False when nothing could take the item, so the caller must not acknowledge it. */
  notify(item: MegamindRecord): boolean {
    const target = [...this.senders].find((sender) => !sender.isDestroyed())
    if (!target) {
      return false
    }
    target.send('arcaMegamind:notification', item)
    return true
  }
}
