import type {
  StatusMdRecentTask,
  StatusMdRecentTasks,
  StatusMdTaskProject
} from '../../../../preload/api/status-md-tasks-api'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { StatusTaskRows } from './StatusTaskRows'

type RecentTasksPaneProps = {
  recent: StatusMdRecentTasks
  onOpen: (project: StatusMdTaskProject, task: StatusMdTask) => void
  onWork: (project: StatusMdTaskProject, task: StatusMdTask) => Promise<void>
  onCopy: (task: StatusMdTask) => Promise<void>
}

function projectOf(item: StatusMdRecentTask): StatusMdTaskProject {
  return {
    repoId: item.repoId,
    name: item.projectName,
    path: item.path,
    statusPath: item.statusPath,
    status: 'available',
    tasks: [item.task],
    updatedAt: null
  }
}

function relativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })
  if (elapsed < hour) {
    return formatter.format(-Math.max(1, Math.round(elapsed / minute)), 'minute')
  }
  if (elapsed < day) {
    return formatter.format(-Math.round(elapsed / hour), 'hour')
  }
  return formatter.format(-Math.round(elapsed / day), 'day')
}

function RecentRow({
  item,
  completed,
  ...actions
}: {
  item: StatusMdRecentTask
  completed?: boolean
  onOpen: RecentTasksPaneProps['onOpen']
  onWork: RecentTasksPaneProps['onWork']
  onCopy: RecentTasksPaneProps['onCopy']
}): React.JSX.Element {
  const project = projectOf(item)
  return (
    <div className={cn('border-b border-border/40 py-1 last:border-0', completed && 'opacity-70')}>
      <div className="flex items-center justify-between gap-2 px-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {item.projectName}
          {item.task.section ? ` · ${item.task.section}` : ''}
        </span>
        <span className="shrink-0">{relativeTime(item.changedAt)}</span>
      </div>
      <div className={cn(completed && '[&_button]:line-through')}>
        <StatusTaskRows project={project} tasks={[item.task]} showSection={false} {...actions} />
      </div>
    </div>
  )
}

export function RecentTasksPane({ recent, ...actions }: RecentTasksPaneProps): React.JSX.Element {
  if (recent.open.length === 0 && recent.completed.length === 0) {
    return (
      <p className="px-3 py-5 text-center text-xs text-muted-foreground">
        {translate('auto.components.priorities.noRecentTasks', 'No recent tasks')}
      </p>
    )
  }
  return (
    <div>
      {recent.open.map((item) => (
        <RecentRow key={`${item.repoId}:${item.task.id}`} item={item} {...actions} />
      ))}
      {recent.completed.length > 0 ? (
        <div className="mt-2 border-t border-border/60 pt-1">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
            {translate('auto.components.priorities.recentlyCompleted', 'Recently completed')}
          </p>
          {recent.completed.map((item) => (
            <RecentRow key={`${item.repoId}:${item.task.id}`} item={item} completed {...actions} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
