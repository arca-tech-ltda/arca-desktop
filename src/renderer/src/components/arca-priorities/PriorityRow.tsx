import { AlertTriangle, Clock, ExternalLink, Play } from 'lucide-react'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type PriorityRowProps = {
  project: ArcaPriorityProject
  compact?: boolean
  onOpenStatus: (project: ArcaPriorityProject) => void
  onWork: (project: ArcaPriorityProject) => void
  agents?: Record<string, unknown>[]
}

function agentName(agent: Record<string, unknown>): string {
  const value = agent.name ?? agent.label ?? agent.actor_name
  return typeof value === 'string' ? value : ''
}

const NO_AGENTS: Record<string, unknown>[] = []

function projectAgents(agents: Record<string, unknown>[], project: ArcaPriorityProject) {
  return agents.filter((agent) =>
    [agent.project_id, agent.repo_key].some(
      (value) => typeof value === 'string' && [project.projectId, project.repoKey].includes(value)
    )
  )
}

export function PriorityRow({
  project,
  compact = false,
  onOpenStatus,
  onWork,
  agents = NO_AGENTS
}: PriorityRowProps): React.JSX.Element {
  const present = projectAgents(agents, project)
  const blocked = project.blocked[0]
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        blocked ? 'border-destructive/50 bg-destructive/10' : 'border-border/60 bg-card'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold">{project.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {project.source === 'shared'
                ? translate('auto.components.priorities.sharedSource', 'shared')
                : translate('auto.components.priorities.localSource', 'local')}
            </span>
          </div>
          {project.title ? (
            <p className="mt-1 truncate text-sm">{project.title}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {translate('auto.components.priorities.noPriority', 'No priority defined')}
            </p>
          )}
          {project.title ? (
            <div className="mt-2 flex items-center gap-2">
              <Progress value={project.percent ?? 0} className="h-1.5 flex-1" />
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {project.percent === null
                  ? translate('auto.components.priorities.noTasks', 'no tasks')
                  : `${project.percent}% · ${project.done} ${translate('auto.components.priorities.of', 'of')} ${project.total}`}
              </span>
            </div>
          ) : null}
          {blocked ? (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {translate('auto.components.priorities.blockedBy', 'Blocked by')}{' '}
                {blocked.blockedBy || '—'} · {blocked.text}
              </span>
            </div>
          ) : null}
          {!compact && project.queue.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                {translate('auto.components.priorities.queue', 'Queue')}
              </p>
              {project.queue.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{item.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.percent === null ? '—' : `${item.percent}%`}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {present.map((agent) => {
              const name = agentName(agent)
              return name ? (
                <span
                  key={String(agent.id ?? name)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted font-medium text-foreground">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  {name}
                </span>
              ) : null
            })}
            {project.hours7d !== null ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                {project.hours7d.toFixed(1)}h{' '}
                {project.hoursLabel === 'yours'
                  ? translate('auto.components.priorities.yourTime', 'your time')
                  : translate('auto.components.priorities.teamTime', 'team time')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {project.title ? (
            <Button type="button" variant="outline" size="xs" onClick={() => onWork(project)}>
              <Play className="size-3" />
              {translate('auto.components.priorities.workOnThis', 'Work on this')}
            </Button>
          ) : null}
          {project.statusPath ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenStatus(project)}
              aria-label={translate('auto.components.priorities.openStatus', 'Open STATUS.md')}
            >
              <ExternalLink className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
