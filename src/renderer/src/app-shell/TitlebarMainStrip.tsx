import { useSyncExternalStore } from 'react'
import { Minimize2, PanelRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { megamindUnreadSnapshot, subscribeMegamindUnread } from '@/attention/megamind-unread-store'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '@/constants/terminal'
import { ActivityTitlebarControls } from '../components/activity/ActivityTitlebarControls'
import { useShortcutLabel } from '../hooks/useShortcutLabel'
import { useAppStore } from '../store'
import { hasCustomTitleBar } from './app-window-chrome'
import type { AppChromeLayout } from './use-app-chrome-layout'

export function RightSidebarToggle(): React.JSX.Element {
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar)
  const rightSidebarShortcutLabel = useShortcutLabel('sidebar.right.toggle')
  const unread = useSyncExternalStore(
    subscribeMegamindUnread,
    megamindUnreadSnapshot,
    megamindUnreadSnapshot
  )
  const unreadLabel =
    unread > 0
      ? translate('arca.megamind.unreadSidebarLabel', 'Megamind: {{count}} unread', {
          count: unread
        })
      : null
  const toggleLabel = translate('auto.App.9e0b441a91', 'Toggle right sidebar')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="sidebar-toggle relative mr-2"
          onClick={toggleRightSidebar}
          aria-label={unreadLabel ? `${toggleLabel} — ${unreadLabel}` : toggleLabel}
        >
          <PanelRight size={16} />
          {unread > 0 && (
            <Badge
              size="compact"
              variant="secondary"
              className="absolute top-0 right-0"
              aria-hidden="true"
            >
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('auto.App.c184e056de', 'Toggle right sidebar ({{value0}})', {
          value0: rightSidebarShortcutLabel
        })}
        {unreadLabel && <span className="ml-2">{unreadLabel}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/** The titlebar's center/right strip: the tab-strip portal slot and the trailing chrome buttons. */
export function TitlebarMainStrip({ layout }: { layout: AppChromeLayout }): React.JSX.Element {
  const handleToggleExpand = (): void => {
    if (!layout.effectiveActiveTabId) {
      return
    }
    window.dispatchEvent(
      new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, {
        detail: { tabId: layout.effectiveActiveTabId }
      })
    )
  }

  return (
    <>
      {layout.activeView === 'activity' ? (
        <ActivityTitlebarControls />
      ) : layout.creationLayoutActive ? null : (
        <div
          id="titlebar-tabs"
          className={`flex flex-1 min-w-0 self-stretch${!layout.workspaceChromeActive ? ' invisible pointer-events-none' : ''}`}
        />
      )}
      {layout.showTitlebarExpandButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="titlebar-icon-button"
              onClick={handleToggleExpand}
              aria-label={translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
              disabled={!layout.activeTabCanExpand}
            >
              <Minimize2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
          </TooltipContent>
        </Tooltip>
      )}
      {/* Why: the open right sidebar's header renders its own close button, so hide this duplicate. */}
      {layout.showRightSidebarControls && !layout.rightSidebarOpen ? <RightSidebarToggle /> : null}
      {/* Why: reserve space so the Windows/Linux window-controls overlay doesn't obscure content. */}
      {hasCustomTitleBar && <div className="window-controls-titlebar-spacer" />}
    </>
  )
}
