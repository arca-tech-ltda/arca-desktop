import {
  isMegamindChannelId,
  type MegamindChatChannel,
  type MegamindChatMessage
} from '../../shared/arca-megamind-chat'

/** Channels the directory does not list yet (a brand-new DM) still deserve their unread badge. */
export function mergeMegamindChatChannels(
  channels: MegamindChatChannel[],
  recent: readonly MegamindChatMessage[],
  previous: readonly MegamindChatChannel[],
  unread: ReadonlyMap<string, number>
): MegamindChatChannel[] {
  const known = new Set(channels.map((channel) => channel.channel))
  const extra = [...unread.keys()]
    .filter((channel) => !known.has(channel))
    .map(
      (channel) =>
        previous.find((item) => item.channel === channel) ??
        channelFromRecent(channel, recent, unread)
    )
    .filter((channel): channel is MegamindChatChannel => channel !== undefined)
  return [...channels, ...extra].map((channel) => ({
    ...channel,
    unread: unread.get(channel.channel) ?? 0
  }))
}

function channelFromRecent(
  channel: string,
  recent: readonly MegamindChatMessage[],
  unread: ReadonlyMap<string, number>
): MegamindChatChannel | undefined {
  if (!isMegamindChannelId(channel) || !channel.startsWith('dm:')) {
    return undefined
  }
  const message = recent.toReversed().find((item) => item.channel === channel)
  if (!message) {
    return undefined
  }
  return {
    channel,
    kind: 'dm',
    handle: '',
    name: message.authorLabel || message.authorName,
    lastMessageAt: message.createdAt,
    lastMessageBody: message.body,
    unread: unread.get(channel) ?? 0
  }
}
