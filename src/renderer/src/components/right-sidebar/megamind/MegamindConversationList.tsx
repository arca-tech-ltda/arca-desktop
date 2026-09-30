import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  megamindPersonName,
  megamindSessionName,
  type MegamindChatChannel,
  type MegamindMember
} from '../../../../../shared/arca-megamind-chat'
import { MegamindPresenceDot } from './MegamindPresenceDot'
import { megamindConversationTime } from './megamind-chat-time'
import {
  megamindInitial,
  megamindMemberState,
  megamindPresenceLabel
} from './megamind-presence-state'

/**
 * A DM is titled after the person as `chat_members` knows them now; the channel's own name is the
 * e-mail local part the directory denormalized, which survives a handle change.
 */
export function megamindChannelTitle(
  channel: MegamindChatChannel,
  members: readonly MegamindMember[] = []
): string {
  if (channel.kind === 'group') {
    return `# ${channel.channel}`
  }
  const member = members.find((item) => item.handle === channel.handle)
  return megamindPersonName(member, channel.handle || channel.name)
}

/** The group first, then the direct messages with the freshest at the top. */
export function megamindConversationRows(
  channels: readonly MegamindChatChannel[]
): MegamindChatChannel[] {
  const group = channels.filter((channel) => channel.kind === 'group')
  const dms = channels
    .filter((channel) => channel.kind === 'dm' && (channel.lastMessageAt !== '' || channel.unread))
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))
  return [...group, ...dms]
}

function subtitle(channel: MegamindChatChannel, member: MegamindMember | undefined): string {
  if (channel.lastMessageBody) {
    return channel.lastMessageBody
  }
  if (channel.kind === 'group') {
    return translate('arca.megamind.groupSubtitle', 'Everyone at ARCA')
  }
  if (!member) {
    return ''
  }
  const state = megamindMemberState(member)
  const session = member.sessions.find((item) => item.status !== 'recent')
  return session
    ? `${megamindPresenceLabel(state)} · ${megamindSessionName(session)}`
    : megamindPresenceLabel(state)
}

export function MegamindConversationList({
  channels,
  members,
  emptyText,
  onOpen
}: {
  channels: readonly MegamindChatChannel[]
  members: readonly MegamindMember[]
  emptyText: string
  onOpen: (channel: string) => void
}): React.JSX.Element {
  const rows = megamindConversationRows(channels)
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="flex flex-col px-2">
      <p className="px-1 pb-1 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {translate('arca.megamind.conversations', 'Conversations')}
      </p>
      {rows.map((channel) => {
        const member = members.find((item) => item.handle === channel.handle)
        const title = megamindChannelTitle(channel, members)
        return (
          <button
            key={channel.channel}
            type="button"
            onClick={() => onOpen(channel.channel)}
            className={cn(
              'flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-transform',
              'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99]'
            )}
          >
            <span className="relative shrink-0">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
                {channel.kind === 'group' ? '#' : megamindInitial(title, channel.handle)}
              </span>
              {member && (
                <MegamindPresenceDot
                  state={megamindMemberState(member)}
                  className="absolute right-0 bottom-0 ring-2 ring-background"
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {megamindConversationTime(channel.lastMessageAt)}
                </span>
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {subtitle(channel, member)}
              </span>
            </span>
            {channel.unread > 0 && <Badge variant="default">{channel.unread}</Badge>}
          </button>
        )
      })}
    </div>
  )
}
