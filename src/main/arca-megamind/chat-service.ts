import {
  emptyMegamindChatState,
  type MegamindChatAvailability,
  type MegamindChatMessage,
  type MegamindChatPostResult,
  type MegamindChatState
} from '../../shared/arca-megamind-chat'
import type { MegamindChatAlert } from '../../shared/arca-megamind-notifications'
import type { ChatFailure, MegamindChatClient } from './chat-client'
import { mergeMegamindChatChannels } from './chat-channel-directory'
import { applyMegamindChatActivity } from './chat-message-activity'
import { loadMegamindChatHistory } from './chat-history-loader'

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
  private readChannel: string | null | undefined
  private historyReady = false
  private generation = 0
  private channelGeneration = 0
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
    if (reason === 'login') {
      this.clearSession()
    }
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
    this.generation += 1
    this.cancelTimer?.()
  }

  /** Called by the panel: only a visible chat tab earns the fast poll. */
  setVisible(visible: boolean, readChannel?: string | null): void {
    if (this.visible === visible && this.readChannel === readChannel) {
      return
    }
    this.visible = visible
    this.readChannel = readChannel
    this.markRead(this.state.activeChannel)
    if (visible) {
      void this.refresh()
    }
  }

  private isReading(channel: string): boolean {
    return (
      this.visible &&
      this.historyReady &&
      channel === this.state.activeChannel &&
      (this.readChannel === undefined || this.readChannel === channel)
    )
  }

  async setActiveChannel(channel: string): Promise<void> {
    if (this.state.activeChannel !== channel) {
      this.channelGeneration += 1
      this.historyReady = false
      this.state = { ...this.state, activeChannel: channel, messages: [], historyLoading: true }
      this.publish()
    }
    await this.refresh()
  }

  markRead(channel: string): void {
    if (this.isReading(channel) && this.unread.get(channel)) {
      this.unread.delete(channel)
      this.publish()
    }
  }

  async post(target: string, body: string): Promise<MegamindChatPostResult> {
    const generation = this.generation
    const result = await this.options.client.post(target, body)
    if (!result.ok) {
      // A rejected write says nothing about whether the chat is readable; only a session fact does.
      if (
        generation === this.generation &&
        (result.reason === 'login' || result.reason === 'unsupported')
      ) {
        this.fail(result.reason)
      }
      return { status: result.reason }
    }
    if (generation === this.generation) {
      void this.refresh()
    }
    return { status: 'ok', woken: result.value }
  }

  /** Signing in or out invalidates the viewer, so the next poll re-reads it and re-seeds. */
  resetSession(): void {
    this.clearSession()
    this.publish()
    void this.refresh()
  }

  private clearSession(): void {
    this.generation += 1
    this.state = emptyMegamindChatState()
    this.unread.clear()
    this.seen.clear()
    this.historyReady = false
    this.seeded = false
    this.since = ''
  }

  private schedule(): void {
    if (!this.running) {
      return
    }
    this.cancelTimer?.()
    const delay =
      this.state.availability === 'unsupported'
        ? BACKGROUND_INTERVAL * 10
        : this.state.availability === 'error'
          ? BACKGROUND_INTERVAL
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
    const generation = this.generation
    const channelGeneration = this.channelGeneration
    const channel = this.state.activeChannel
    const current = (): boolean =>
      this.running && generation === this.generation && channelGeneration === this.channelGeneration
    if (!this.state.viewerHandle) {
      const identity = await this.options.client.identity()
      if (!current()) {
        return
      }
      if (!identity.ok) {
        this.fail(identity.reason)
        return
      }
      this.state = { ...this.state, viewerHandle: identity.value.handle }
    }
    const [channels, recent] = await Promise.all([
      this.options.client.channels(),
      this.options.client.recent(this.since)
    ])
    if (!current()) {
      return
    }
    if (!channels.ok) {
      this.fail(channels.reason)
      return
    }
    if (!recent.ok) {
      this.fail(recent.reason)
      return
    }
    const history = this.visible
      ? await loadMegamindChatHistory(channel, recent.value, this.state.messages, (activeChannel) =>
          this.options.client.history(activeChannel)
        )
      : { messages: this.state.messages, loaded: false }
    if (!current()) {
      return
    }
    this.historyReady = history.loaded
    const activity = applyMegamindChatActivity(
      recent.value,
      { seen: this.seen, seeded: this.seeded, since: this.since },
      this.unread,
      this.state.viewerHandle,
      (activeChannel) => this.isReading(activeChannel),
      (message, alert) => this.options.alert(message, alert)
    )
    this.seen = activity.seen
    this.seeded = activity.seeded
    this.since = activity.since
    this.state = {
      ...this.state,
      availability: 'ready',
      channels: mergeMegamindChatChannels(
        channels.value,
        recent.value,
        this.state.channels,
        this.unread
      ),
      messages: history.messages,
      historyLoading:
        history.loaded || history.messages.length > 0 ? false : this.state.historyLoading
    }
    this.markRead(channel)
    this.publish()
  }
}
