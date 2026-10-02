import React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  useWorkspaceOptionsFilterBadge,
  WorkspaceOptionsMenuItems
} from './workspace-options-menu-items'
import { keepMenuOpenForStatusAppearancePopover } from './workspace-status-appearance-dismiss'

const SidebarWorkspaceOptionsMenu = React.memo(function SidebarWorkspaceOptionsMenu() {
  const { hasAnyFilter, activeFilterCount, activeFilterLabel } = useWorkspaceOptionsFilterBadge()

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              className="relative text-muted-foreground"
              aria-label={
                hasAnyFilter
                  ? translate(
                      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.bc96dbd041',
                      'Workspace options ({{value0}} active)',
                      { value0: activeFilterLabel }
                    )
                  : translate(
                      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.9919ae1082',
                      'Workspace options'
                    )
              }
            >
              <SlidersHorizontal className="size-3.5" strokeWidth={2.25} />
              {hasAnyFilter && (
                // Why: this combined options button now owns filtering, so it
                // needs the same at-a-glance signal that the old filter button had.
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium leading-none text-primary-foreground"
                >
                  {activeFilterCount > 9 ? '9+' : activeFilterCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {hasAnyFilter
            ? translate(
                'auto.components.sidebar.SidebarWorkspaceOptionsMenu.bc96dbd041',
                'Workspace options ({{value0}})',
                { value0: activeFilterLabel }
              )
            : translate(
                'auto.components.sidebar.SidebarWorkspaceOptionsMenu.9919ae1082',
                'Workspace options'
              )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 pb-2"
        onInteractOutside={keepMenuOpenForStatusAppearancePopover}
      >
        <WorkspaceOptionsMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

export default SidebarWorkspaceOptionsMenu
