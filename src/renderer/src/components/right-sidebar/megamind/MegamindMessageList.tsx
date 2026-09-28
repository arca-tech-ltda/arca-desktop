import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { mentionsHandle, splitMentionSegments } from '../../../../../shared/arca-megamind-mentions'
import { megamindClockTime } from './megamind-chat-time'
import type { MegamindChatMessage } from '../../../../../shared/arca-megamind-chat'

function MessageBody({
  body,
  viewerHandle
}: {
  body: string
  viewerHandle: string
}): React.JSX.Element {
  return (
    <p className="whitespace-pre-wrap break-words text-xs text-foreground">
      {splitMentionSegments(body).map((segment, index) =>
        segment.mention ? (
          <span
            // Segments are positional, and a body can repeat the same mention.
            key={`${index}-${segment.text}`}
            className={cn(
              'rounded px-0.5 font-medium',
              mentionsHandle(segment.text, viewerHandle)
                ? 'bg-primary/20 text-foreground'
                : 'text-primary'
            )}
          >
            {segment.text}
          </span>
        ) : (
          <span key={`${index}-text`}>{segment.text}</span>
        )
      )}
    </p>
  )
}

export function MegamindMessageList({
  messages,
  viewerHandle,
  emptyText
}: {
  messages: readonly MegamindChatMessage[]
  viewerHandle: string
  emptyText: string
}): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastId = messages.at(-1)?.id
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId])
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-center text-xs text-muted-foreground">{emptyText}</p>
      </div>
    )
  }
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
      {/* A short history sits at the bottom, where a chat reads from. */}
      <div className="mt-auto flex flex-col gap-2.5">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-xs font-medium text-foreground">
                {message.authorName}
              </span>
              {message.authorKind === 'agent' && (
                <Badge variant="hostContext">
                  {translate('arca.megamind.agentBadge', 'agent')}
                </Badge>
              )}
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {megamindClockTime(message.createdAt)}
              </span>
            </div>
            <MessageBody body={message.body} viewerHandle={viewerHandle} />
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
