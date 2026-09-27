import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Plus } from 'lucide-react'
import type { MegamindChatChannel } from '../../../../../shared/arca-megamind-chat'

function label(channel: MegamindChatChannel): string {
  return channel.kind === 'group' ? `# ${channel.channel}` : `@${channel.handle}`
}

/** Channels with history stay on the strip; the rest are one click away in the picker. */
export function MegamindChannelBar({
  channels,
  activeChannel,
  onSelect
}: {
  channels: readonly MegamindChatChannel[]
  activeChannel: string
  onSelect: (channel: string) => void
}): React.JSX.Element {
  const started = channels.filter(
    (channel) =>
      channel.kind === 'group' ||
      channel.lastMessageAt !== '' ||
      channel.unread > 0 ||
      channel.channel === activeChannel
  )
  const unstarted = channels.filter((channel) => !started.includes(channel))
  const newDmLabel = translate('arca.megamind.newDirectMessage', 'New direct message')
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border p-1">
      <div className="scrollbar-sleek flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {started.map((channel) => (
          <button
            key={channel.channel}
            type="button"
            aria-pressed={channel.channel === activeChannel}
            onClick={() => onSelect(channel.channel)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap',
              channel.channel === activeChannel
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {label(channel)}
            {channel.unread > 0 && <Badge variant="default">{channel.unread}</Badge>}
          </button>
        ))}
      </div>
      {unstarted.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={newDmLabel}>
              <Plus className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {unstarted.map((channel) => (
              <DropdownMenuItem key={channel.channel} onSelect={() => onSelect(channel.channel)}>
                {label(channel)}
                <span className="ml-2 truncate text-muted-foreground">{channel.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
