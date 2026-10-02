import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'
import {
  applyMentionCompletion,
  mentionCandidates,
  mentionDraftAt,
  type MentionCandidate
} from '../../../../../shared/arca-megamind-mentions'
import type { MegamindMember } from '../../../../../shared/arca-megamind-chat'
import { MegamindPresenceDot } from './MegamindPresenceDot'
import { megamindSessionState } from './megamind-presence-state'
import {
  clearMegamindComposerDraftIfCurrent,
  megamindComposerDraft,
  megamindComposerDraftRevision,
  setMegamindComposerDraft,
  subscribeMegamindComposerDrafts
} from './megamind-composer-drafts'

type MegamindComposerProps = {
  channel: string
  draftScope: string
  members: readonly MegamindMember[]
  placeholder: string
  disabled: boolean
  /** Resolves false when the message did not land, so the draft stays where the user can retry. */
  onSend: (body: string) => Promise<boolean>
}

export function MegamindComposer({
  channel,
  draftScope,
  members,
  placeholder,
  disabled,
  onSend
}: MegamindComposerProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const channelRef = useRef(channel)
  const channelRevisionRef = useRef(0)
  const pendingChannelsRef = useRef(new Set<string>())
  const focusRestoreRef = useRef<{ channel: string; revision: number } | null>(null)
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const [pendingChannels, setPendingChannels] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const [showSendingFeedback, setShowSendingFeedback] = useState(false)
  const ime = useImeEnterGestureOwnership()
  const body = useSyncExternalStore(
    subscribeMegamindComposerDrafts,
    () => megamindComposerDraft(draftScope, channel),
    () => ''
  )
  const sending = pendingChannels.has(channel)

  useEffect(() => {
    channelRef.current = channel
    channelRevisionRef.current += 1
    setCandidates([])
    setHighlighted(0)
  }, [channel])

  useEffect(() => {
    if (!sending) {
      setShowSendingFeedback(false)
      return
    }
    const timer = window.setTimeout(() => setShowSendingFeedback(true), 200)
    return () => window.clearTimeout(timer)
  }, [sending])

  useEffect(() => {
    const pendingFocus = focusRestoreRef.current
    if (
      sending ||
      !pendingFocus ||
      pendingFocus.channel !== channel ||
      pendingFocus.revision !== channelRevisionRef.current
    ) {
      return
    }
    const frame = requestAnimationFrame(() => {
      const activeElement = document.activeElement
      if (
        focusRestoreRef.current === pendingFocus &&
        channelRef.current === pendingFocus.channel &&
        channelRevisionRef.current === pendingFocus.revision &&
        (activeElement === document.body || activeElement === inputRef.current)
      ) {
        inputRef.current?.focus()
      }
      if (focusRestoreRef.current === pendingFocus) {
        focusRestoreRef.current = null
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [channel, sending])

  const refreshCandidates = useCallback(
    (text: string, caret: number) => {
      const draft = mentionDraftAt(text, caret)
      setCandidates(draft ? mentionCandidates(members, draft.query) : [])
      setHighlighted(0)
    },
    [members]
  )

  const complete = useCallback(
    (handle: string) => {
      const input = inputRef.current
      const caret = input?.selectionStart ?? body.length
      const next = applyMentionCompletion(body, caret, handle)
      setMegamindComposerDraft(draftScope, channel, next.text)
      setCandidates([])
      requestAnimationFrame(() => {
        input?.focus()
        input?.setSelectionRange(next.caret, next.caret)
      })
    },
    [body, channel, draftScope]
  )

  const send = useCallback(
    async (submitOwnsFocus = inputRef.current === document.activeElement) => {
      const text = body.trim()
      const draftAtSend = body
      const draftRevision = megamindComposerDraftRevision(draftScope, channel)
      const channelRevision = channelRevisionRef.current
      if (!text || pendingChannelsRef.current.has(channel) || disabled) {
        return
      }
      pendingChannelsRef.current.add(channel)
      setPendingChannels(new Set(pendingChannelsRef.current))
      try {
        if (await onSend(text)) {
          clearMegamindComposerDraftIfCurrent(draftScope, channel, draftAtSend, draftRevision)
        }
      } finally {
        pendingChannelsRef.current.delete(channel)
        setPendingChannels(new Set(pendingChannelsRef.current))
        if (
          submitOwnsFocus &&
          channelRef.current === channel &&
          channelRevisionRef.current === channelRevision
        ) {
          focusRestoreRef.current = { channel, revision: channelRevision }
        }
      }
    },
    [body, channel, disabled, draftScope, onSend]
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (candidates.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : candidates.length - 1
        setHighlighted((index) => (index + step) % candidates.length)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setCandidates([])
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault()
        complete(candidates[highlighted]?.handle ?? candidates[0].handle)
        return
      }
    }
    if (ime.ownsKeyDown(event)) {
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(true)
    }
  }

  return (
    <div className="relative shrink-0 p-2">
      {candidates.length > 0 && (
        <ul
          role="listbox"
          aria-label={translate('arca.megamind.mentionSuggestions', 'Mention suggestions')}
          className="absolute bottom-full left-2 z-10 mb-1 w-[calc(100%-1rem)] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-floating"
        >
          {candidates.map((candidate, index) => (
            <li key={candidate.session?.id ?? candidate.handle}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                  index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  complete(candidate.handle)
                }}
              >
                {candidate.session && (
                  <MegamindPresenceDot state={megamindSessionState(candidate.session.status)} />
                )}
                <span className="shrink-0 font-medium">
                  {candidate.session ? candidate.session.name : `@${candidate.handle}`}
                </span>
                <span className="truncate text-muted-foreground">
                  {candidate.session
                    ? translate('arca.megamind.mentionSession', 'session of {{name}}', {
                        name: candidate.name
                      })
                    : candidate.agent
                      ? translate('arca.megamind.mentionAgent', 'agent of {{name}}', {
                          name: candidate.name
                        })
                      : // The name repeats the handle whenever the handle is the current identity.
                        candidate.name === candidate.handle
                        ? ''
                        : candidate.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        ref={inputRef}
        rows={2}
        value={body}
        disabled={disabled || sending}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-14 resize-none"
        onCompositionStart={() => ime.setComposing(true)}
        onCompositionEnd={() => ime.setComposing(false)}
        onKeyUp={ime.onKeyUp}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const nextBody = event.target.value
          setMegamindComposerDraft(draftScope, channel, nextBody)
          refreshCandidates(nextBody, event.target.selectionStart)
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {translate('arca.megamind.composerHint', 'Enter sends · Shift+Enter adds a line')}
        </p>
        <Button
          type="button"
          size="default"
          disabled={disabled || sending || !body.trim()}
          className="w-28"
          aria-label={
            sending && showSendingFeedback
              ? translate('arca.megamind.chatSending', 'Sending…')
              : translate('arca.megamind.chatSend', 'Send')
          }
          onClick={() => void send()}
        >
          {sending && showSendingFeedback ? (
            <>
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
              {translate('arca.megamind.chatSending', 'Sending…')}
            </>
          ) : (
            <>
              <Send aria-hidden="true" />
              {translate('arca.megamind.chatSend', 'Send')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
