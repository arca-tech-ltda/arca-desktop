import { useCallback, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  megamindSessionName,
  MEGAMIND_GROUP_CHANNEL
} from '../../../../../shared/arca-megamind-chat'
import type {
  MegamindChatPostFailure,
  MegamindChatPostResult,
  MegamindChatState,
  MegamindChatWake,
  MegamindMember,
  MegamindMemberSession
} from '../../../../../shared/arca-megamind-chat'
import { MegamindComposer } from './MegamindComposer'
import { MegamindMessageList } from './MegamindMessageList'
import { MegamindPresenceDot } from './MegamindPresenceDot'
import { megamindChannelTitle } from './MegamindConversationList'
import { megamindSessionState } from './megamind-presence-state'

function postFailureMessage(reason: MegamindChatPostFailure): string {
  switch (reason) {
    case 'login':
      return translate(
        'arca.megamind.chatPostLogin',
        'Your Mainframe session expired. Sign in and send again.'
      )
    case 'rate':
      return translate(
        'arca.megamind.chatPostRateLimited',
        'Too many messages at once. Wait a moment and send again.'
      )
    case 'tooLong':
      return translate(
        'arca.megamind.chatPostTooLong',
        'The Mainframe rejected this message: it is too long.'
      )
    case 'forbidden':
      return translate('arca.megamind.chatPostForbidden', 'You cannot post in this channel.')
    case 'unsupported':
      return translate('arca.megamind.chatPostUnsupported', 'This Mainframe has no chat.')
    case 'error':
      return translate(
        'arca.megamind.chatPostFailed',
        'Could not confirm delivery. Check the conversation before retrying.'
      )
  }
}

/** What the server did with the `@handle-pi` mentions in the message that was just sent. */
function wakeMessage(woken: readonly MegamindChatWake[]): string | null {
  const lines = woken.map((wake) =>
    wake.woken
      ? translate('arca.megamind.chatAgentWoken', 'Agent of {{handle}} woken', {
          handle: wake.handle
        })
      : translate('arca.megamind.chatAgentAsleep', 'No active agent for {{handle}}', {
          handle: wake.handle
        })
  )
  return lines.length > 0 ? lines.join(' · ') : null
}

/** One chip per session of the person on the other side: what they run and how it is doing. */
function SessionChips({
  sessions
}: {
  sessions: readonly MegamindMemberSession[]
}): React.JSX.Element | null {
  if (sessions.length === 0) {
    return null
  }
  return (
    <div className="scrollbar-sleek flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2">
      {sessions.map((session) => (
        <span
          key={session.sessionId}
          title={[session.label, session.note].filter(Boolean).join(' — ')}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <MegamindPresenceDot state={megamindSessionState(session.status)} />
          <span className="max-w-40 truncate">{megamindSessionName(session)}</span>
        </span>
      ))}
    </div>
  )
}

/** Tied to the conversation it was raised in, so going back leaves it behind. */
type ComposerNotice = { channel: string; tone: 'error' | 'info'; text: string }

export function MegamindConversation({
  channel: openChannel,
  isVisible = true,
  state,
  members,
  post,
  onBack
}: {
  /** The conversation the user opened, which leads what main echoes back. */
  channel: string
  isVisible?: boolean
  state: MegamindChatState
  members: readonly MegamindMember[]
  post: (target: string, body: string) => Promise<MegamindChatPostResult>
  onBack: () => void
}): React.JSX.Element {
  const [pendingNotice, setNotice] = useState<ComposerNotice | null>(null)
  const notice = pendingNotice?.channel === openChannel ? pendingNotice : null
  const active = state.channels.find((channel) => channel.channel === openChannel)
  const partner = members.find((member) => member.handle === active?.handle)
  // Main clears the history while it loads the new channel; until then the old one is not ours.
  const loading =
    state.activeChannel !== openChannel ||
    state.availability === 'loading' ||
    state.historyLoading === true
  // The post route addresses the group by name and a DM by the partner's handle, never by channel
  // id. Until the directory resolves the active channel, there is no safe target: sending anyway
  // would put a private message in the group.
  const target =
    active?.channel !== openChannel
      ? null
      : active.kind === 'dm'
        ? active.handle || null
        : active.kind === 'group' && openChannel === MEGAMIND_GROUP_CHANNEL
          ? MEGAMIND_GROUP_CHANNEL
          : null
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!target) {
        return false
      }
      const result = await post(target, body)
      const channel = openChannel
      if (result.status !== 'ok') {
        setNotice({ channel, tone: 'error', text: postFailureMessage(result.status) })
        return false
      }
      const wake = wakeMessage(result.woken)
      setNotice(wake ? { channel, tone: 'info', text: wake } : null)
      return true
    },
    [openChannel, post, target]
  )
  const agentCount = partner?.sessions.length ?? 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="active:scale-[0.96]"
          aria-label={translate('arca.megamind.back', 'Back to conversations')}
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {active ? megamindChannelTitle(active, members) : openChannel}
          {agentCount > 0 && (
            <span className="font-normal text-muted-foreground">
              {' · '}
              {agentCount === 1
                ? translate('arca.megamind.agentOne', '1 agent')
                : translate('arca.megamind.agentMany', '{{count}} agents', {
                    count: agentCount
                  })}
            </span>
          )}
        </span>
      </div>
      {partner && <SessionChips sessions={partner.sessions} />}
      {state.availability === 'error' && (
        <p role="alert" className="shrink-0 px-3 pb-1 text-xs text-destructive">
          {translate('arca.megamind.chatOffline', 'Chat is out of contact. Retrying.')}
        </p>
      )}
      {/* Keep the composer alive, but measure history only with a visible viewport. */}
      {isVisible && (
        <MegamindMessageList
          channel={openChannel}
          messages={loading ? [] : state.messages}
          viewerHandle={state.viewerHandle}
          emptyText={
            loading
              ? translate('arca.megamind.chatLoading', 'Loading chat…')
              : translate('arca.megamind.chatEmpty', 'No messages in this channel yet.')
          }
        />
      )}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'shrink-0 px-3 pt-1 text-xs',
            notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {notice.text}
        </p>
      )}
      <MegamindComposer
        channel={openChannel}
        draftScope={state.viewerHandle}
        members={members}
        disabled={!isVisible || state.availability !== 'ready' || target === null}
        placeholder={
          target === null
            ? translate('arca.megamind.chatResolvingRecipient', 'Resolving conversation…')
            : active?.kind === 'dm'
              ? translate('arca.megamind.composerDm', 'Message @{{handle}}', {
                  handle: active.handle
                })
              : translate('arca.megamind.composerGroup', 'Message # arca')
        }
        onSend={send}
      />
    </div>
  )
}
