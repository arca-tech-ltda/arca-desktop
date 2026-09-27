import { useCallback, useEffect, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'
import { consumeMegamindMention, megamindPanelRoute } from '@/attention/megamind-panel-route'
import {
  applyMentionCompletion,
  mentionCandidates,
  mentionDraftAt,
  type MentionCandidate
} from '../../../../../shared/arca-megamind-mentions'
import type { MegamindMember } from '../../../../../shared/arca-megamind-chat'

type MegamindComposerProps = {
  members: readonly MegamindMember[]
  placeholder: string
  disabled: boolean
  /** Resolves false when the message did not land, so the draft stays where the user can retry. */
  onSend: (body: string) => Promise<boolean>
}

export function MegamindComposer({
  members,
  placeholder,
  disabled,
  onSend
}: MegamindComposerProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [body, setBody] = useState('')
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const [sending, setSending] = useState(false)
  const ime = useImeEnterGestureOwnership()

  const refreshCandidates = useCallback(
    (text: string, caret: number) => {
      const draft = mentionDraftAt(text, caret)
      setCandidates(draft ? mentionCandidates(members, draft.query) : [])
      setHighlighted(0)
    },
    [members]
  )

  // The presence tab hands the composer a handle to mention.
  useEffect(() => {
    const pending = megamindPanelRoute().pendingMention
    if (!pending) {
      return
    }
    consumeMegamindMention()
    setBody((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${pending} `)
    inputRef.current?.focus()
  }, [])

  const complete = useCallback(
    (handle: string) => {
      const input = inputRef.current
      const caret = input?.selectionStart ?? body.length
      const next = applyMentionCompletion(body, caret, handle)
      setBody(next.text)
      setCandidates([])
      requestAnimationFrame(() => {
        input?.focus()
        input?.setSelectionRange(next.caret, next.caret)
      })
    },
    [body]
  )

  const send = useCallback(async () => {
    const text = body.trim()
    if (!text || sending || disabled) {
      return
    }
    setSending(true)
    try {
      if (await onSend(text)) {
        setBody('')
        setCandidates([])
      }
    } finally {
      setSending(false)
    }
  }, [body, disabled, onSend, sending])

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
      void send()
    }
  }

  return (
    <div className="relative shrink-0 border-t border-border p-2">
      {candidates.length > 0 && (
        <ul
          role="listbox"
          aria-label={translate('arca.megamind.mentionSuggestions', 'Mention suggestions')}
          className="absolute bottom-full left-2 z-10 mb-1 w-[calc(100%-1rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-floating"
        >
          {candidates.map((candidate, index) => (
            <li key={candidate.handle}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1 text-left text-xs',
                  index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  complete(candidate.handle)
                }}
              >
                <span className="font-medium">@{candidate.handle}</span>
                <span className="truncate text-muted-foreground">
                  {candidate.agent
                    ? translate('arca.megamind.mentionAgent', 'agent of {{name}}', {
                        name: candidate.name
                      })
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
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-14 resize-none"
        onCompositionStart={() => ime.setComposing(true)}
        onCompositionEnd={() => ime.setComposing(false)}
        onKeyUp={ime.onKeyUp}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setBody(event.target.value)
          refreshCandidates(event.target.value, event.target.selectionStart)
        }}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {translate('arca.megamind.composerHint', 'Enter sends · Shift+Enter adds a line')}
      </p>
    </div>
  )
}
