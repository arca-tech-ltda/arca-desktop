import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { MegamindChatChannel, MegamindMember } from '../../../../../shared/arca-megamind-chat'
import { MegamindPresenceDot } from './MegamindPresenceDot'
import {
  megamindInitial,
  megamindMemberState,
  megamindPresenceLabel
} from './megamind-presence-state'

/** Everyone on this Mainframe, newest state first; tapping someone opens the conversation. */
export function MegamindPeopleStrip({
  members,
  channels,
  viewerHandle,
  onOpenConversation
}: {
  members: readonly MegamindMember[]
  channels: readonly MegamindChatChannel[]
  viewerHandle: string
  onOpenConversation: (channel: string) => void
}): React.JSX.Element {
  if (members.length === 0) {
    return (
      <p className="px-3 pb-2 text-xs text-muted-foreground">
        {translate('arca.megamind.presenceEmpty', 'No one is registered on this Mainframe yet.')}
      </p>
    )
  }
  return (
    <div className="scrollbar-sleek flex shrink-0 gap-1 overflow-x-auto px-2 pb-2">
      {members.map((member) => {
        const state = megamindMemberState(member)
        const dm = channels.find(
          (channel) => channel.kind === 'dm' && channel.handle === member.handle
        )
        const self = member.handle === viewerHandle
        const label = self
          ? translate('arca.megamind.you', 'you')
          : `@${member.handle} · ${megamindPresenceLabel(state)}`
        return (
          <Tooltip key={member.handle}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                disabled={self || !dm}
                onClick={() => dm && onOpenConversation(dm.channel)}
                className={cn(
                  'flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg py-1 transition-transform',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  self || !dm ? 'cursor-default' : 'hover:bg-accent active:scale-[0.96]'
                )}
              >
                <span className="relative">
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground ring-1 ring-border">
                    {megamindInitial(member.name, member.handle)}
                  </span>
                  <MegamindPresenceDot
                    state={state}
                    className="absolute right-0 bottom-0 size-2.5 ring-2 ring-background"
                  />
                </span>
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                  {self ? translate('arca.megamind.you', 'you') : member.handle}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
