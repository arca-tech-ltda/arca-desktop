import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { requestMegamindMention } from '@/attention/megamind-panel-route'
import { AGENT_MENTION_SUFFIX } from '../../../../../shared/arca-megamind-mentions'
import type {
  MegamindChatChannel,
  MegamindMember,
  MegamindMemberSession
} from '../../../../../shared/arca-megamind-chat'

function SessionRow({ session }: { session: MegamindMemberSession }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-0.5 rounded-md bg-accent/40 px-2 py-1">
      <div className="flex items-baseline gap-1.5">
        <span className="truncate text-[11px] font-medium">{session.project || '—'}</span>
        <span className="truncate text-[11px] text-muted-foreground">{session.harness}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {formatUiRelativeTimeFromDate(session.lastSeen.replace(' ', 'T'), '')}
        </span>
      </div>
      {session.note && (
        <span className="truncate text-[11px] text-muted-foreground">{session.note}</span>
      )}
    </li>
  )
}

export function MegamindPresenceTab({
  members,
  degraded,
  channels,
  onOpenDm
}: {
  members: readonly MegamindMember[]
  degraded: boolean
  channels: readonly MegamindChatChannel[]
  onOpenDm: (channel: string) => void
}): React.JSX.Element {
  if (members.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-center text-xs text-muted-foreground">
          {translate('arca.megamind.presenceEmpty', 'No one is registered on this Mainframe yet.')}
        </p>
      </div>
    )
  }
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {degraded && (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'arca.megamind.presenceDegraded',
            'This Mainframe predates per-person presence; app and agent are told apart by session.'
          )}
        </p>
      )}
      {members.map((member) => {
        const dm = channels.find(
          (channel) => channel.kind === 'dm' && channel.handle === member.handle
        )
        return (
          <section
            key={member.handle}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium">@{member.handle}</span>
              <span className="truncate text-[11px] text-muted-foreground">{member.name}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={member.appOnline ? 'secondary' : 'outline'}>
                {translate('arca.megamind.appPresence', 'app')}
              </Badge>
              <Badge variant={member.online ? 'secondary' : 'outline'}>
                {translate('arca.megamind.agentPresence', 'agent')}
              </Badge>
            </div>
            {member.sessions.length > 0 && (
              <ul className="flex flex-col gap-1">
                {member.sessions.map((session) => (
                  <SessionRow key={session.sessionId} session={session} />
                ))}
              </ul>
            )}
            <div className="flex gap-1">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={!dm}
                onClick={() => dm && onOpenDm(dm.channel)}
              >
                {translate('arca.megamind.message', 'Message')}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => requestMegamindMention(`${member.handle}${AGENT_MENTION_SUFFIX}`)}
              >
                {translate('arca.megamind.mentionAgentAction', 'Mention agent')}
              </Button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
