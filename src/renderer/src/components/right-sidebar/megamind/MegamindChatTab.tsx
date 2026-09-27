import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { MEGAMIND_GROUP_CHANNEL } from '../../../../../shared/arca-megamind-chat'
import type {
  MegamindChatPostFailure,
  MegamindChatState,
  MegamindChatPostResult,
  MegamindChatWake,
  MegamindMember
} from '../../../../../shared/arca-megamind-chat'
import { MegamindChannelBar } from './MegamindChannelBar'
import { MegamindComposer } from './MegamindComposer'
import { MegamindMessageList } from './MegamindMessageList'

type MegamindChatTabProps = {
  state: MegamindChatState
  members: readonly MegamindMember[]
  selectChannel: (channel: string) => void
  post: (target: string, body: string) => Promise<MegamindChatPostResult>
}

function MegamindChatNotice({
  message,
  action
}: {
  message: string
  action?: { label: string; run: () => void }
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      {action && (
        <Button type="button" variant="outline" size="xs" onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

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
        'The message was not sent. Check your connection and try again.'
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

/** Tied to the channel it was raised in, so switching channels leaves it behind. */
type ComposerNotice = { channel: string; tone: 'error' | 'info'; text: string }

export function MegamindChatTab({
  state,
  members,
  selectChannel,
  post
}: MegamindChatTabProps): React.JSX.Element {
  const [pendingNotice, setNotice] = useState<ComposerNotice | null>(null)
  const notice = pendingNotice?.channel === state.activeChannel ? pendingNotice : null
  const active = state.channels.find((channel) => channel.channel === state.activeChannel)
  // The post route addresses the group by name and a DM by the partner's handle, never by channel
  // id. Until the directory resolves the active DM there is no safe target: sending anyway would
  // put a private message in the group.
  const target =
    active?.kind === 'dm'
      ? active.handle
      : state.activeChannel === MEGAMIND_GROUP_CHANNEL
        ? MEGAMIND_GROUP_CHANNEL
        : null
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!target) {
        return false
      }
      const result = await post(target, body)
      const channel = state.activeChannel
      if (result.status !== 'ok') {
        setNotice({ channel, tone: 'error', text: postFailureMessage(result.status) })
        return false
      }
      const wake = wakeMessage(result.woken)
      setNotice(wake ? { channel, tone: 'info', text: wake } : null)
      return true
    },
    [post, state.activeChannel, target]
  )
  if (state.availability === 'unsupported') {
    return (
      <MegamindChatNotice
        message={translate(
          'arca.megamind.chatUnsupported',
          'This Mainframe has no chat. Presence and approvals still work.'
        )}
      />
    )
  }
  if (state.availability === 'login') {
    return (
      <MegamindChatNotice
        message={translate('arca.megamind.chatLogin', 'Sign in to Mainframe to read the chat.')}
        action={{
          label: translate('arca.megamind.signIn', 'Sign in'),
          run: () => void window.api.arcaMegamind.openMainframeLogin()
        }}
      />
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MegamindChannelBar
        channels={state.channels}
        activeChannel={state.activeChannel}
        onSelect={selectChannel}
      />
      {state.availability === 'error' && (
        <p role="alert" className="shrink-0 px-2 py-1 text-[11px] text-destructive">
          {translate('arca.megamind.chatOffline', 'Chat is out of contact. Retrying.')}
        </p>
      )}
      <MegamindMessageList
        messages={state.messages}
        viewerHandle={state.viewerHandle}
        emptyText={
          state.availability === 'loading'
            ? translate('arca.megamind.chatLoading', 'Loading chat…')
            : translate('arca.megamind.chatEmpty', 'No messages in this channel yet.')
        }
      />
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'shrink-0 px-2 pt-1 text-[11px]',
            notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {notice.text}
        </p>
      )}
      <MegamindComposer
        members={members}
        disabled={state.availability !== 'ready' || target === null}
        placeholder={
          active?.kind === 'dm'
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
