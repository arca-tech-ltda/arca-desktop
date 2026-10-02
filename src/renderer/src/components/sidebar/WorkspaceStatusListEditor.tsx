import React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getWorkspaceStatusVisualMeta } from './workspace-status'
import { useWorkspaceStatusEditorActions } from './use-workspace-status-editor-actions'
import WorkspaceStatusAppearancePopover from './WorkspaceStatusAppearancePopover'
import { translate } from '@/i18n/i18n'

/** Editor for the workspace statuses the sidebar groups and drops workspaces into. */
export default function WorkspaceStatusListEditor(): React.JSX.Element {
  const {
    workspaceStatuses,
    renameStatus,
    changeStatusColor,
    changeStatusIcon,
    moveStatus,
    addStatus,
    removeStatus
  } = useWorkspaceStatusEditorActions()

  return (
    <div className="space-y-2 px-1 py-1">
      {workspaceStatuses.map((status, index) => {
        const meta = getWorkspaceStatusVisualMeta(status)
        return (
          <div
            key={status.id}
            className="rounded-md border border-border/70 bg-background/40 p-1.5"
          >
            <div className="flex items-center gap-1">
              <meta.icon className={cn('size-3.5 shrink-0', meta.tone)} />
              <Input
                defaultValue={status.label}
                onBlur={(event) => renameStatus(status.id, event.target.value)}
                onKeyDown={(event) => {
                  // Why: the menu treats typing as type-ahead navigation and
                  // closes on Enter; both must stop at the rename field.
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                className="h-7 min-w-0 flex-1"
                aria-label={translate(
                  'auto.components.sidebar.WorkspaceStatusListEditor.renameStatus',
                  'Rename {{value0}}',
                  { value0: status.label }
                )}
              />
              <WorkspaceStatusAppearancePopover
                status={status}
                onChangeColor={changeStatusColor}
                onChangeIcon={changeStatusIcon}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7"
                disabled={index === 0}
                onClick={() => moveStatus(status.id, -1)}
                aria-label={translate(
                  'auto.components.sidebar.WorkspaceStatusListEditor.moveStatusUp',
                  'Move {{value0}} up',
                  { value0: status.label }
                )}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7"
                disabled={index === workspaceStatuses.length - 1}
                onClick={() => moveStatus(status.id, 1)}
                aria-label={translate(
                  'auto.components.sidebar.WorkspaceStatusListEditor.moveStatusDown',
                  'Move {{value0}} down',
                  { value0: status.label }
                )}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7 text-muted-foreground hover:text-destructive"
                disabled={workspaceStatuses.length <= 1}
                onClick={() => removeStatus(status.id)}
                aria-label={translate(
                  'auto.components.sidebar.WorkspaceStatusListEditor.removeStatus',
                  'Remove {{value0}}',
                  { value0: status.label }
                )}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="mt-1 h-7 w-full justify-start text-[12px]"
        onClick={addStatus}
      >
        <Plus className="size-3.5" />
        {translate('auto.components.sidebar.WorkspaceStatusListEditor.addStatus', 'Add status')}
      </Button>
    </div>
  )
}
