import {
  isMegamindChannelId,
  MEGAMIND_GROUP_CHANNEL,
  type MegamindChatChannel,
  type MegamindChatMessage,
  type MegamindChatWake
} from '../../shared/arca-megamind-chat'
import { object } from './credentials'
import type { MainframeUserRunner } from './mainframe-user-guest'

export type ChatFailure = 'login' | 'unsupported' | 'forbidden' | 'rate' | 'tooLong' | 'error'
export type ChatResult<T> = { ok: true; value: T } | { ok: false; reason: ChatFailure }

const MESSAGE_FIELDS =
  'id,channel,author_kind,author_name,author_label,body,mentions,created,author'
const HANDLE = /^[a-z][a-z0-9-]{1,31}$/
/** PocketBase prints `created` in this shape; anything else must not reach a filter expression. */
const CREATED_AT = /^\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?$/

const failure = (reason: ChatFailure): ChatResult<never> => ({ ok: false, reason })

function toMessage(value: unknown): MegamindChatMessage | null {
  if (!object(value) || typeof value.id !== 'string' || typeof value.body !== 'string') {
    return null
  }
  if (!isMegamindChannelId(value.channel) || typeof value.createdAt !== 'string') {
    return null
  }
  return {
    id: value.id,
    channel: value.channel,
    authorKind: value.authorKind === 'agent' ? 'agent' : 'human',
    authorName: typeof value.authorName === 'string' ? value.authorName : '',
    authorLabel: typeof value.authorLabel === 'string' ? value.authorLabel : '',
    body: value.body.slice(0, 8192),
    mentions: Array.isArray(value.mentions)
      ? value.mentions.filter((item): item is string => typeof item === 'string')
      : [],
    createdAt: value.createdAt,
    mine: value.mine === true
  }
}

function toChannel(value: unknown): MegamindChatChannel | null {
  if (!object(value) || !isMegamindChannelId(value.channel)) {
    return null
  }
  const dm = value.channel !== MEGAMIND_GROUP_CHANNEL
  const handle = typeof value.handle === 'string' ? value.handle : ''
  if (dm && !HANDLE.test(handle)) {
    return null
  }
  return {
    channel: value.channel,
    kind: dm ? 'dm' : 'group',
    handle: dm ? handle : '',
    name: typeof value.name === 'string' && value.name ? value.name : handle || 'ARCA',
    lastMessageAt: typeof value.lastMessageAt === 'string' ? value.lastMessageAt : '',
    unread: 0
  }
}

/**
 * Chat reads and writes made as the signed-in human. History and channel discovery come straight
 * from the Mainframe (collection API and `/api/arca/chat/channels`); nothing here is cached.
 */
export class MegamindChatClient {
  constructor(private readonly run: MainframeUserRunner) {}

  private async request(
    path: string,
    projection: 'approvals' | 'chatChannels' | 'chatMessages' | 'chatPost' | 'ok',
    body?: unknown
  ): Promise<ChatResult<unknown>> {
    let result: Awaited<ReturnType<MainframeUserRunner>>
    try {
      result = await this.run({ path, projection, body })
    } catch {
      return failure('error')
    }
    if (result === 'login') {
      return failure('login')
    }
    // A server without chat answers 404 on both the route and the collection.
    if (result.status === 404) {
      return failure('unsupported')
    }
    if (result.status === 403) {
      return failure('forbidden')
    }
    if (result.status === 429) {
      return failure('rate')
    }
    if (result.status === 400 || result.status === 413 || result.status === 422) {
      return failure('tooLong')
    }
    if (result.status < 200 || result.status >= 300) {
      return failure('error')
    }
    return { ok: true, value: result.data }
  }

  async identity(): Promise<ChatResult<{ id: string; handle: string; name: string }>> {
    let result: Awaited<ReturnType<MainframeUserRunner>>
    try {
      result = await this.run('identity')
    } catch {
      return failure('error')
    }
    if (result === 'login') {
      return failure('login')
    }
    const data = result.data
    if (!object(data) || typeof data.id !== 'string' || typeof data.handle !== 'string') {
      return failure('error')
    }
    return {
      ok: true,
      value: {
        id: data.id,
        handle: data.handle,
        name: typeof data.name === 'string' ? data.name : ''
      }
    }
  }

  async channels(): Promise<ChatResult<MegamindChatChannel[]>> {
    const result = await this.request('/api/arca/chat/channels', 'chatChannels')
    if (!result.ok) {
      return result
    }
    const items = Array.isArray(result.value) ? result.value : []
    return { ok: true, value: items.map(toChannel).filter((item) => item !== null) }
  }

  private async messages(
    filter: string,
    limit: number
  ): Promise<ChatResult<MegamindChatMessage[]>> {
    const query = new URLSearchParams({
      perPage: String(limit),
      sort: '-created',
      fields: MESSAGE_FIELDS,
      ...(filter ? { filter } : {})
    })
    const result = await this.request(
      `/api/collections/arca_chat_messages/records?${query.toString()}`,
      'chatMessages'
    )
    if (!result.ok) {
      return result
    }
    const items = Array.isArray(result.value) ? result.value : []
    // The collection answers newest first; the panel reads oldest first.
    const parsed = items.map(toMessage).filter((item) => item !== null)
    return { ok: true, value: parsed.toReversed() }
  }

  /** History of one channel, oldest first. */
  history(channel: string, limit = 50): Promise<ChatResult<MegamindChatMessage[]>> {
    if (!isMegamindChannelId(channel)) {
      return Promise.resolve(failure('error'))
    }
    return this.messages(`channel="${channel}"`, limit)
  }

  /**
   * The newest messages across every channel the viewer may read. The collection's list rule is
   * what scopes this to the group plus the viewer's own DMs, so no channel filter is needed.
   * `since` asks only for what arrived after the last poll, so a burst between two background
   * polls cannot push new messages past the page and lose their alerts.
   */
  recent(since = '', limit = since ? 200 : 30): Promise<ChatResult<MegamindChatMessage[]>> {
    const filter = since && CREATED_AT.test(since) ? `created>"${since}"` : ''
    return this.messages(filter, limit)
  }

  /** `target` is `arca` or a partner handle — the route resolves the DM channel itself. */
  async post(
    target: string,
    body: string,
    replyTo?: string
  ): Promise<ChatResult<MegamindChatWake[]>> {
    if (target !== MEGAMIND_GROUP_CHANNEL && !HANDLE.test(target)) {
      return failure('error')
    }
    if (body.length === 0 || Buffer.byteLength(body) > 8192) {
      return failure('tooLong')
    }
    const result = await this.request('/api/arca/chat', 'chatPost', {
      channel: target,
      body,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
    if (!result.ok) {
      return result
    }
    const items = Array.isArray(result.value) ? result.value : []
    return {
      ok: true,
      value: items
        .map((item): MegamindChatWake | null =>
          object(item) && typeof item.handle === 'string' && HANDLE.test(item.handle)
            ? { handle: item.handle, woken: item.woken === true }
            : null
        )
        .filter((item) => item !== null)
    }
  }
}
