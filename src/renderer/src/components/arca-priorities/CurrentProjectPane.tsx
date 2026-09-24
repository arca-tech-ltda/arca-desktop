import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'
import { translate } from '@/i18n/i18n'
import { Progress } from '@/components/ui/progress'
import { ProjectPresence } from './ProjectPresence'
import { selectProjectCardTasks, statusProjectProgress } from './priority-card-data'
import { StatusTaskRows } from './StatusTaskRows'

type CurrentProjectPaneProps = {
  project: StatusMdTaskProject
  priority: ArcaPriorityProject | null
  agents: Record<string, unknown>[]
  onOpen: (project: StatusMdTaskProject, task: StatusMdTask) => void
  onWork: (project: StatusMdTaskProject, task: StatusMdTask) => Promise<void>
  onCopy: (task: StatusMdTask) => Promise<void>
}

export function CurrentProjectPane({
  project,
  priority,
  agents,
  ...actions
}: CurrentProjectPaneProps): React.JSX.Element {
  const tasks = selectProjectCardTasks(project, priority)
  const progress = priority?.title
    ? { percent: priority.percent ?? 0, done: priority.done, total: priority.total }
    : statusProjectProgress(project)
  return (
    <div className="space-y-2 p-2">
      <div className="px-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{project.name}</p>
            <p className="truncate text-sm">
              {priority?.title ?? translate('auto.components.priorities.openTasks', 'Open tasks')}
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progress.percent}%
          </span>
        </div>
        <Progress value={progress.percent} className="mt-2 h-1.5" />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {progress.done} {translate('auto.components.priorities.of', 'of')} {progress.total}
        </p>
      </div>
      {tasks.length > 0 ? (
        <StatusTaskRows
          project={project}
          tasks={tasks}
          blockedLines={new Set(priority?.blocked.map((task) => task.line) ?? [])}
          {...actions}
        />
      ) : (
        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
          {translate('auto.components.priorities.noOpenTasks', 'No open tasks')}
        </p>
      )}
      <div className="px-1">
        <ProjectPresence
          agents={agents}
          projectId={priority?.projectId ?? project.repoId}
          repoKey={priority?.repoKey}
        />
      </div>
    </div>
  )
}
