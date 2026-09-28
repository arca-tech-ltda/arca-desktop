import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ExternalLink, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { refreshMegamindApprovals } from '@/attention/megamind-approvals-store'
import {
  consumeMegamindRequestedChannel,
  megamindPanelRoute,
  subscribeMegamindPanelRoute
} from '@/attention/megamind-panel-route'
import { MegamindApprovalCards } from './megamind/MegamindApprovalCards'
import { MegamindConversation } from './megamind/MegamindConversation'
import { MegamindConversationList } from './megamind/MegamindConversationList'
import { MegamindPeopleStrip } from './megamind/MegamindPeopleStrip'
import { MegamindPresenceDot } from './megamind/MegamindPresenceDot'
import { MegamindSetup } from './megamind/MegamindSetup'
import { useMegamindChat, useMegamindMembers } from './megamind/use-megamind-chat'
import { useMegamindConnection } from './megamind/use-megamind-connection'

function MegamindNotice({
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

function HeaderButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="active:scale-[0.96]"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** One screen: who is around, what is waiting on you, and the conversations. */
export default function MegamindPanel({
  isVisible = true
}: {
  isVisible?: boolean
}): React.JSX.Element {
  const route = useSyncExternalStore(subscribeMegamindPanelRoute, megamindPanelRoute)
  const { state, selectChannel, post } = useMegamindChat(isVisible)
  const { members, degraded } = useMegamindMembers(isVisible)
  const connection = useMegamindConnection()
  const [openChannel, setOpenChannel] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [panelUrl, setPanelUrl] = useState<string | null>(null)
  const open = useCallback(
    (channel: string) => {
      selectChannel(channel)
      setOpenChannel(channel)
    },
    [selectChannel]
  )
  // The approval count must be right as soon as the panel opens, not only after the app-wide poll.
  useEffect(() => {
    if (isVisible) {
      refreshMegamindApprovals()
    }
  }, [isVisible])
  useEffect(() => {
    void window.api.arcaMainframe
      ?.getPanel()
      .then((descriptor) => setPanelUrl(descriptor?.panelUrl ?? null))
      .catch(() => setPanelUrl(null))
  }, [])
  // A notification carries the conversation it was about; opening the panel must land there.
  useEffect(() => {
    if (isVisible && route.requestedChannel) {
      open(route.requestedChannel)
      consumeMegamindRequestedChannel()
    }
  }, [isVisible, open, route])

  if (isWebClientLocation()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium">
          {translate('arca.megamind.unsupportedTitle', 'Megamind needs the desktop app')}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {translate(
            'arca.megamind.unsupportedDetail',
            'Megamind signs in to the ARCA Mainframe from the desktop app, which the paired web client cannot do.'
          )}
        </p>
      </div>
    )
  }

  const connected = connection.status.state === 'connected'
  const settingsLabel = translate('arca.megamind.setup', 'Connection and setup')
  const openExternallyLabel = translate('arca.megamind.openInMainframe', 'Open in Mainframe')
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* An open conversation carries its own header, with the way back in it. */}
      {!openChannel && (
        <div className="flex h-11 shrink-0 items-center gap-1 px-3">
          <MegamindPresenceDot
            state={connected ? 'working' : connection.status.state === 'pending' ? 'idle' : 'away'}
            label={
              connected
                ? translate('arca.megamind.connected', 'Connected')
                : translate('arca.megamind.notConnected', 'Not connected')
            }
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {translate('arca.megamind.title', 'Megamind')}
            {connection.status.device && (
              <span className="font-normal text-muted-foreground">
                {' · '}
                {connection.status.device}
              </span>
            )}
          </span>
          <HeaderButton label={settingsLabel} onClick={() => setSetupOpen((value) => !value)}>
            <Settings />
          </HeaderButton>
          {panelUrl && (
            <HeaderButton
              label={openExternallyLabel}
              onClick={() => void window.api.shell.openUrl(panelUrl)}
            >
              <ExternalLink />
            </HeaderButton>
          )}
        </div>
      )}
      <MegamindSetup connection={connection} expanded={setupOpen} />
      {state.availability === 'unsupported' ? (
        <MegamindNotice
          message={translate(
            'arca.megamind.chatUnsupported',
            'This Mainframe has no chat. Presence and approvals still work.'
          )}
        />
      ) : state.availability === 'login' ? (
        <MegamindNotice
          message={translate('arca.megamind.chatLogin', 'Sign in to Mainframe to read the chat.')}
          action={{
            label: translate('arca.megamind.signIn', 'Sign in'),
            run: () => void window.api.arcaMegamind.openMainframeLogin()
          }}
        />
      ) : openChannel ? (
        <MegamindConversation
          channel={openChannel}
          state={state}
          members={members}
          post={post}
          onBack={() => setOpenChannel(null)}
        />
      ) : (
        <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2">
          <MegamindPeopleStrip
            members={members}
            channels={state.channels}
            viewerHandle={state.viewerHandle}
            onOpenConversation={open}
          />
          {degraded && (
            <p className="px-3 pb-2 text-[11px] text-muted-foreground">
              {translate(
                'arca.megamind.presenceDegraded',
                'This Mainframe predates per-person presence; app and agent are told apart by session.'
              )}
            </p>
          )}
          <MegamindApprovalCards />
          <MegamindConversationList
            channels={state.channels}
            members={members}
            emptyText={
              state.availability === 'loading'
                ? translate('arca.megamind.chatLoading', 'Loading chat…')
                : translate('arca.megamind.chatOffline', 'Chat is out of contact. Retrying.')
            }
            onOpen={open}
          />
        </div>
      )}
    </div>
  )
}
