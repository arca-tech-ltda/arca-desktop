import { useState } from 'react'
import { AlertTriangle, Check, Clipboard, Play } from 'lucide-react'
import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type StatusTaskRowsProps = {
  project: StatusMdTaskProject
  tasks: readonly StatusMdTask[]
  blockedLines?: ReadonlySet<number>
  showSection?: boolean
  onOpen: (project: StatusMdTaskProject, task: StatusMdTask) => void
  onWork: (project: StatusMdTaskProject, task: StatusMdTask) => Promise<void>
  onCopy: (task: StatusMdTask) => Promise<void>
}

export function StatusTaskRows({
  project,
  tasks,
  blockedLines,
  showSection = true,
  onOpen,
  onWork,
  onCopy
}: StatusTaskRowsProps): React.JSX.Element {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copy = async (task: StatusMdTask): Promise<void> => {
    await onCopy(task)
    setCopiedId(task.id)
    window.setTimeout(() => setCopiedId(null), 1200)
  }

  return (
    <div className="space-y-0.5">
      {tasks.map((task) => {
        const blocked = blockedLines?.has(task.lineNumber) === true
        return (
          <div
            key={task.id}
            className={cn(
              'group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
              blocked && 'bg-destructive/10 text-destructive'
            )}
          >
            {blocked ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <span className="mt-1 size-2 shrink-0 rounded-full border border-muted-foreground" />
            )}
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onOpen(project, task)}
            >
              <span className="block truncate text-xs">{task.title}</span>
              {showSection && task.section ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {task.section}
                </span>
              ) : null}
            </button>
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void onWork(project, task)}
                    aria-label={translate('auto.components.TaskPage.workWithPi', 'Work with Pi')}
                  >
                    <Play className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {translate('auto.components.TaskPage.workWithPi', 'Work with Pi')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void copy(task)}
                    aria-label={translate('auto.components.TaskPage.copyTask', 'Copy')}
                  >
                    {copiedId === task.id ? (
                      <Check className="size-3" />
                    ) : (
                      <Clipboard className="size-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {translate('auto.components.TaskPage.copyTask', 'Copy')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )
      })}
    </div>
  )
}
