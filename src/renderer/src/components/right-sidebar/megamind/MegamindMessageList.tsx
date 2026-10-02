import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <p className="whitespace-pre-wrap break-words text-sm leading-normal text-foreground">
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

const NEAR_BOTTOM_THRESHOLD = 24

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD
}

export function MegamindMessageList({
  channel,
  messages,
  viewerHandle,
  emptyText
}: {
  channel: string
  messages: readonly MegamindChatMessage[]
  viewerHandle: string
  emptyText: string
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previousChannelRef = useRef(channel)
  const previousLastIdRef = useRef<string | undefined>(undefined)
  const nearBottomRef = useRef(true)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const lastId = messages.at(-1)?.id

  const scrollToLatest = useCallback((): void => {
    const container = containerRef.current
    if (!container) {
      return
    }
    container.scrollTop = container.scrollHeight
    nearBottomRef.current = true
    setShowNewMessages(false)
  }, [])

  useLayoutEffect(() => {
    const channelChanged = previousChannelRef.current !== channel
    const wasEmpty = previousLastIdRef.current === undefined
    const hasNewLastMessage = previousLastIdRef.current !== lastId
    previousChannelRef.current = channel
    previousLastIdRef.current = lastId

    if (channelChanged) {
      nearBottomRef.current = true
      setShowNewMessages(false)
    }
    if (messages.length === 0) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }
    if (channelChanged || wasEmpty || (hasNewLastMessage && nearBottomRef.current)) {
      scrollToLatest()
    } else if (hasNewLastMessage) {
      setShowNewMessages(true)
    }
  }, [channel, lastId, messages.length, scrollToLatest])

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-center text-xs text-muted-foreground">{emptyText}</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        data-testid="megamind-message-list"
        className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2"
        onScroll={(event) => {
          nearBottomRef.current = isNearBottom(event.currentTarget)
          if (nearBottomRef.current) {
            setShowNewMessages(false)
          }
        }}
      >
        {/* A short history sits at the bottom, where a chat reads from. */}
        <div className="mt-auto flex flex-col gap-2.5">
          {messages.map((message) => (
            <div key={message.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-xs font-medium text-foreground">
                  {message.authorName}
                </span>
                {message.mine && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {translate('arca.megamind.you', 'You')}
                  </span>
                )}
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
      </div>
      {showNewMessages && (
        <div className="flex shrink-0 justify-center py-1">
          <Button type="button" size="sm" variant="secondary" onClick={scrollToLatest}>
            {translate('arca.megamind.chatNewMessages', 'New messages')}
          </Button>
        </div>
      )}
    </div>
  )
}
