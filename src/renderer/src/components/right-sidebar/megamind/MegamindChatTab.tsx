import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { MEGAMIND_GROUP_CHANNEL } from '../../../../../shared/arca-megamind-chat'
import type {
  MegamindChatState,
  MegamindChatPostResult,
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

export function MegamindChatTab({
  state,
  members,
  selectChannel,
  post
}: MegamindChatTabProps): React.JSX.Element {
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
    async (body: string) => {
      if (target) {
        await post(target, body)
      }
    },
    [post, target]
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
