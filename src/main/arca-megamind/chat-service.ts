import {
  emptyMegamindChatState,
  type MegamindChatAvailability,
  type MegamindChatChannel,
  type MegamindChatMessage,
  type MegamindChatPostResult,
  type MegamindChatState
} from '../../shared/arca-megamind-chat'
import {
  classifyMegamindChatAlert,
  type MegamindChatAlert
} from '../../shared/arca-megamind-notifications'
import type { ChatFailure, ChatResult, MegamindChatClient } from './chat-client'

/** What the service needs from the client, so a test can stand in without the transport. */
export type MegamindChatTransport = Pick<
  MegamindChatClient,
  'identity' | 'channels' | 'recent' | 'history' | 'post'
>

const VISIBLE_INTERVAL = 5_000
const BACKGROUND_INTERVAL = 30_000

export type MegamindChatServiceOptions = {
  client: MegamindChatTransport
  publish: (state: MegamindChatState) => void
  alert: (message: MegamindChatMessage, alert: MegamindChatAlert) => void
  /** Schedules the next poll and returns its cancel; injected so tests drive the loop themselves. */
  setTimer?: (callback: () => void, ms: number) => () => void
}

/**
 * Owns the chat the panel renders: channel directory, active-channel history and per-channel unread.
 * The panel is a view of this state, so unread counts and notifications survive closing the tab.
 */
export class MegamindChatService {
  private state = emptyMegamindChatState()
  private unread = new Map<string, number>()
  private seen = new Set<string>()
  /** The first poll after a login only establishes what already exists; it never notifies. */
  private seeded = false
  private visible = false
  private running = false
  private busy = false
  /** A refresh asked for while one was in flight (a channel switch): run once the current ends. */
  private queued = false
  /** `created` of the newest message already read, so the next poll asks only for what came after. */
  private since = ''
  private cancelTimer?: () => void
  private readonly setTimer: NonNullable<MegamindChatServiceOptions['setTimer']>

  constructor(private readonly options: MegamindChatServiceOptions) {
    this.setTimer =
      options.setTimer ??
      ((callback, ms) => {
        const timer = setTimeout(callback, ms)
        timer.unref?.()
        return () => clearTimeout(timer)
      })
  }

  snapshot(): MegamindChatState {
    return {
      ...this.state,
      channels: this.state.channels.map((channel) => ({
        ...channel,
        unread: this.unread.get(channel.channel) ?? 0
      }))
    }
  }

  private publish(): void {
    this.options.publish(this.snapshot())
  }

  private fail(reason: ChatFailure): void {
    const availability: MegamindChatAvailability =
      reason === 'login' ? 'login' : reason === 'unsupported' ? 'unsupported' : 'error'
    // A signed-out session must be re-read after the next login, not kept from the old one.
    const viewerHandle = reason === 'login' ? '' : this.state.viewerHandle
    if (this.state.availability !== availability || this.state.viewerHandle !== viewerHandle) {
      this.state = { ...this.state, availability, viewerHandle }
      this.publish()
    }
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    void this.refresh()
  }

  stop(): void {
    this.running = false
    this.cancelTimer?.()
  }

  /** Called by the panel: only a visible chat tab earns the fast poll. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return
    }
    this.visible = visible
    if (visible) {
      void this.refresh()
    }
  }

  async setActiveChannel(channel: string): Promise<void> {
    if (this.state.activeChannel !== channel) {
      this.state = { ...this.state, activeChannel: channel, messages: [] }
      this.publish()
    }
    this.markRead(channel)
    await this.refresh()
  }

  markRead(channel: string): void {
    if (this.unread.get(channel)) {
      this.unread.delete(channel)
      this.publish()
    }
  }

  async post(target: string, body: string): Promise<MegamindChatPostResult> {
    const result = await this.options.client.post(target, body)
    if (!result.ok) {
      // A rejected write says nothing about whether the chat is readable; only a session fact does.
      if (result.reason === 'login' || result.reason === 'unsupported') {
        this.fail(result.reason)
      }
      return { status: result.reason }
    }
    await this.refresh()
    return { status: 'ok', woken: result.value }
  }

  /** Signing in or out invalidates the viewer, so the next poll re-reads it and re-seeds. */
  resetSession(): void {
    this.state = { ...this.state, viewerHandle: '', availability: 'loading' }
    this.seeded = false
    this.since = ''
    void this.refresh()
  }

  private schedule(): void {
    if (!this.running) {
      return
    }
    this.cancelTimer?.()
    const delay =
      this.state.availability === 'unsupported'
        ? BACKGROUND_INTERVAL * 10
        : this.visible
          ? VISIBLE_INTERVAL
          : BACKGROUND_INTERVAL
    this.cancelTimer = this.setTimer(() => void this.refresh(), delay)
  }

  async refresh(): Promise<void> {
    if (!this.running) {
      return
    }
    if (this.busy) {
      this.queued = true
      return
    }
    this.busy = true
    try {
      await this.poll()
      while (this.queued && this.running) {
        this.queued = false
        await this.poll()
      }
    } finally {
      this.busy = false
      this.queued = false
      this.schedule()
    }
  }

  private async poll(): Promise<void> {
    if (!this.state.viewerHandle) {
      const identity = await this.options.client.identity()
      if (!identity.ok) {
        this.fail(identity.reason)
        return
      }
      this.state = { ...this.state, viewerHandle: identity.value.handle }
    }
    const channels = await this.options.client.channels()
    if (!channels.ok) {
      this.fail(channels.reason)
      return
    }
    const recent = await this.options.client.recent(this.since)
    if (!recent.ok) {
      this.fail(recent.reason)
      return
    }
    this.applyRecent(recent.value)
    const messages = this.visible
      ? await this.historyOfActiveChannel(recent.value)
      : this.state.messages
    this.state = {
      ...this.state,
      availability: 'ready',
      channels: this.mergeChannels(channels.value),
      messages
    }
    this.publish()
  }

  private async historyOfActiveChannel(
    recent: readonly MegamindChatMessage[]
  ): Promise<MegamindChatMessage[]> {
    const history: ChatResult<MegamindChatMessage[]> = await this.options.client.history(
      this.state.activeChannel
    )
    if (history.ok) {
      return history.value
    }
    // A failed history poll keeps the panel readable with what is already shown plus the feed.
    const known = new Set(this.state.messages.map((message) => message.id))
    return [
      ...this.state.messages,
      ...recent.filter(
        (message) => message.channel === this.state.activeChannel && !known.has(message.id)
      )
    ]
  }

  /** Channels the directory does not list yet (a brand-new DM) still deserve their unread badge. */
  private mergeChannels(channels: MegamindChatChannel[]): MegamindChatChannel[] {
    const known = new Set(channels.map((channel) => channel.channel))
    const extra = [...this.unread.keys()]
      .filter((channel) => !known.has(channel))
      .map((channel) => this.state.channels.find((item) => item.channel === channel))
      .filter((channel): channel is MegamindChatChannel => channel !== undefined)
    return [...channels, ...extra].map((channel) => ({
      ...channel,
      unread: this.unread.get(channel.channel) ?? 0
    }))
  }

  private applyRecent(messages: readonly MegamindChatMessage[]): void {
    for (const message of messages) {
      if (message.createdAt > this.since) {
        this.since = message.createdAt
      }
      if (this.seen.has(message.id)) {
        continue
      }
      this.seen.add(message.id)
      if (!this.seeded) {
        continue
      }
      const alert = classifyMegamindChatAlert(message, this.state.viewerHandle)
      const read = this.visible && message.channel === this.state.activeChannel
      if (!message.mine && !read) {
        this.unread.set(message.channel, (this.unread.get(message.channel) ?? 0) + 1)
      }
      if (alert && !read) {
        this.options.alert(message, alert)
      }
    }
    if (this.seen.size > 4000) {
      this.seen = new Set([...this.seen].slice(-2000))
    }
    this.seeded = true
  }
}
