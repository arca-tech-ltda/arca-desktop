import { useEffect, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import {
  megamindApprovalsSnapshot,
  refreshMegamindApprovals,
  subscribeMegamindApprovals
} from '@/attention/megamind-approvals-store'
import {
  megamindPanelRoute,
  setMegamindSubTab,
  subscribeMegamindPanelRoute
} from '@/attention/megamind-panel-route'
import type { MegamindSubTab } from '../../../../shared/arca-megamind'
import { MegamindConnection } from './MegamindConnection'
import { MegamindPrerequisites } from './MegamindPrerequisites'
import { MegamindApprovalsTab } from './megamind/MegamindApprovalsTab'
import { MegamindChatTab } from './megamind/MegamindChatTab'
import { MegamindPresenceTab } from './megamind/MegamindPresenceTab'
import { useMegamindChat, useMegamindMembers } from './megamind/use-megamind-chat'

function isSubTab(value: string): value is MegamindSubTab {
  return value === 'chat' || value === 'presence' || value === 'approvals'
}

function SubTabTrigger({
  value,
  label,
  count
}: {
  value: MegamindSubTab
  label: string
  count: number
}): React.JSX.Element {
  return (
    <TabsTrigger value={value}>
      {label}
      {count > 0 && <Badge variant="default">{count}</Badge>}
    </TabsTrigger>
  )
}

export default function MegamindPanel({
  isVisible = true
}: {
  isVisible?: boolean
}): React.JSX.Element {
  const route = useSyncExternalStore(subscribeMegamindPanelRoute, megamindPanelRoute)
  const approvals = useSyncExternalStore(subscribeMegamindApprovals, megamindApprovalsSnapshot)
  const chatVisible = isVisible && route.tab === 'chat'
  const { state, selectChannel, post } = useMegamindChat(chatVisible)
  const { members, degraded } = useMegamindMembers(isVisible)
  const [panelUrl, setPanelUrl] = useState<string | null>(null)
  // The tab badge must be right as soon as the panel opens, not only after the app-wide poll ticks.
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

  const openExternallyLabel = translate('arca.megamind.openInBrowser', 'Open in browser')
  const unread = state.channels.reduce((total, channel) => total + channel.unread, 0)
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
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-8 min-h-8 items-center gap-2 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {translate('arca.megamind.title', 'Megamind')}
        </span>
        {panelUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={openExternallyLabel}
                onClick={() => void window.api.shell.openUrl(panelUrl)}
              >
                <ExternalLink className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {openExternallyLabel}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <MegamindConnection />
      <MegamindPrerequisites />
      <Tabs
        value={route.tab}
        onValueChange={(value) => isSubTab(value) && setMegamindSubTab(value)}
        className="min-h-0 flex-1"
      >
        <div className="shrink-0 border-b border-border px-1">
          <TabsList variant="line">
            <SubTabTrigger
              value="chat"
              label={translate('arca.megamind.tabChat', 'Chat')}
              count={unread}
            />
            <SubTabTrigger
              value="presence"
              label={translate('arca.megamind.tabPresence', 'Presence')}
              count={0}
            />
            <SubTabTrigger
              value="approvals"
              label={translate('arca.megamind.tabApprovals', 'Approvals')}
              count={approvals.items.length}
            />
          </TabsList>
        </div>
        <TabsContent value="chat" className="flex min-h-0 flex-col">
          <MegamindChatTab
            state={state}
            members={members}
            selectChannel={selectChannel}
            post={post}
          />
        </TabsContent>
        <TabsContent value="presence" className="flex min-h-0 flex-col">
          <MegamindPresenceTab
            members={members}
            degraded={degraded}
            channels={state.channels}
            onOpenDm={(channel) => {
              selectChannel(channel)
              setMegamindSubTab('chat')
            }}
          />
        </TabsContent>
        <TabsContent value="approvals" className="flex min-h-0 flex-col">
          <MegamindApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
