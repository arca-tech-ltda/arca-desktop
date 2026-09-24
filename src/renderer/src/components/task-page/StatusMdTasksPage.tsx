import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Clipboard, ExternalLink, Play, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  filterStatusMdTasks,
  groupStatusMdTasksBySection
} from '../../../../shared/status-md-tasks'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'
import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import { PrioritiesSection } from '@/components/arca-priorities/PrioritiesSection'
import { statusMdTaskPrompt, useStatusMdTaskActions } from './useStatusMdTaskActions'

function projectStatusLabel(project: StatusMdTaskProject): string {
  if (project.status === 'missing') {
    return translate('auto.components.TaskPage.statusMdMissing', 'No STATUS.md')
  }
  if (project.status === 'unavailable') {
    return translate('auto.components.TaskPage.statusMdUnavailable', 'Unavailable')
  }
  return translate('auto.components.TaskPage.statusMdAvailable', 'STATUS.md')
}

export type StatusMdTaskDelegateAction = (project: StatusMdTaskProject, task: StatusMdTask) => void

export function StatusMdTasksPage({
  onDelegate
}: { onDelegate?: StatusMdTaskDelegateAction } = {}): React.JSX.Element {
  const closeTaskPage = useAppStore((state) => state.closeTaskPage)
  const { openStatusTask, workWithPi, copyTask } = useStatusMdTaskActions()
  const preselectedRepoId = useAppStore((state) => state.taskPageData.preselectedRepoId)
  const [projects, setProjects] = useState<StatusMdTaskProject[]>([])
  const [filter, setFilter] = useState<'open' | 'all' | 'completed'>('open')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState(preselectedRepoId ?? 'all')
  const [hideMissing, setHideMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [megamindAgentId, setMegamindAgentId] = useState<string | null>(null)

  useEffect(() => {
    setProjectFilter(preselectedRepoId ?? 'all')
  }, [preselectedRepoId])

  useEffect(() => {
    const megamind = window.api.arcaMegamind
    if (!megamind || typeof megamind.agents !== 'function') {
      return
    }
    void megamind
      .agents()
      .then((agents) => {
        const firstAgent = agents.find((agent) => typeof agent.id === 'string')
        setMegamindAgentId(firstAgent && typeof firstAgent.id === 'string' ? firstAgent.id : null)
      })
      .catch(() => setMegamindAgentId(null))
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setProjects(await window.api.statusMdTasks.list())
    } catch {
      toast.error(
        translate('auto.components.TaskPage.statusMdLoadError', 'Could not read STATUS.md files.')
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.api.statusMdTasks.onChanged(() => void refresh())
  }, [refresh])

  const visibleProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          (projectFilter === 'all' || project.repoId === projectFilter) &&
          (!hideMissing || project.status === 'available')
      ),
    [hideMissing, projectFilter, projects]
  )

  const delegateTask = useCallback(
    (project: StatusMdTaskProject, task: StatusMdTask): void => {
      const megamind = window.api.arcaMegamind
      if (!megamindAgentId || !megamind || typeof megamind.createRequest !== 'function') {
        return
      }
      void megamind
        .createRequest(
          megamindAgentId,
          `STATUS.md: ${task.title}`,
          statusMdTaskPrompt(task, project),
          project.repoId
        )
        .then(() =>
          toast.success(translate('auto.components.TaskPage.delegateSuccess', 'Task delegated.'))
        )
        .catch(() =>
          toast.error(
            translate('auto.components.TaskPage.delegateError', 'Could not delegate this task.')
          )
        )
    },
    [megamindAgentId]
  )

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="scrollbar-sleek mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-auto px-5 py-4 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">
              {translate('auto.components.TaskPage.statusMdTitle', 'Tasks')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.TaskPage.statusMdSubtitle',
                'Read from each project’s STATUS.md'
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={closeTaskPage}>
            {translate('auto.components.TaskPage.closeTasks', 'Close')}
          </Button>
        </header>

        <PrioritiesSection />

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={translate('auto.components.TaskPage.statusMdSearch', 'Search tasks')}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            aria-label={translate(
              'auto.components.TaskPage.statusMdProjectFilter',
              'Filter by project'
            )}
          >
            <option value="all">
              {translate('auto.components.TaskPage.allProjects', 'All projects')}
            </option>
            {projects.map((project) => (
              <option key={project.repoId} value={project.repoId}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border border-border/60 p-0.5">
            {(
              [
                ['open', translate('auto.components.TaskPage.statusMdOpen', 'Open')],
                ['all', translate('auto.components.TaskPage.statusMdAll', 'All')],
                ['completed', translate('auto.components.TaskPage.statusMdCompleted', 'Completed')]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded px-2 py-1 text-xs',
                  filter === value ? 'bg-muted font-medium' : 'text-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideMissing}
              onChange={(event) => setHideMissing(event.target.checked)}
            />
            {translate(
              'auto.components.TaskPage.hideMissingStatus',
              'Hide projects without STATUS.md'
            )}
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">
            {translate('auto.components.TaskPage.statusMdLoading', 'Loading tasks…')}
          </p>
        ) : null}
        {!loading && visibleProjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {translate(
              'auto.components.TaskPage.statusMdEmpty',
              'No projects match these filters.'
            )}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {visibleProjects.map((project) => (
            <StatusMdProjectCard
              key={project.repoId}
              project={project}
              filter={filter}
              search={search}
              onOpenTask={openStatusTask}
              onWorkWithPi={workWithPi}
              onCopyTask={copyTask}
              onDelegate={onDelegate ?? (megamindAgentId ? delegateTask : undefined)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

type StatusMdProjectCardProps = {
  project: StatusMdTaskProject
  filter: 'open' | 'all' | 'completed'
  search: string
  onOpenTask: (project: StatusMdTaskProject, task: StatusMdTask) => void
  onWorkWithPi: (project: StatusMdTaskProject, task: StatusMdTask) => Promise<void>
  onCopyTask: (task: StatusMdTask) => Promise<void>
  onDelegate?: StatusMdTaskDelegateAction
}

function StatusMdProjectCard({
  project,
  filter,
  search,
  onOpenTask,
  onWorkWithPi,
  onCopyTask,
  onDelegate
}: StatusMdProjectCardProps): React.JSX.Element {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const filteredTasks = filterStatusMdTasks(project.tasks, filter, search)
  const groups = groupStatusMdTasksBySection(filteredTasks)
  const openCount = project.tasks.filter((task) => !task.completed).length
  const completedCount = project.tasks.length - openCount
  const progress =
    project.tasks.length === 0 ? 0 : Math.round((completedCount / project.tasks.length) * 100)

  const copyTask = async (task: StatusMdTask): Promise<void> => {
    await onCopyTask(task)
    setCopiedId(task.id)
    window.setTimeout(() => setCopiedId(null), 1200)
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card/50">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-40 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{project.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {projectStatusLabel(project)}
            </span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
            aria-label={`${progress}%`}
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {openCount} {translate('auto.components.TaskPage.statusMdOpenCount', 'open')} ·{' '}
          {completedCount} {translate('auto.components.TaskPage.statusMdCompletedCount', 'done')}
        </span>
        {project.updatedAt ? (
          <span className="text-xs text-muted-foreground">{project.updatedAt}</span>
        ) : null}
      </div>
      {project.status === 'available' && groups.length > 0 ? (
        <div className="divide-y divide-border/40">
          {groups.map((group) => (
            <div key={group.section ?? 'unsectioned'} className="px-4 py-3">
              <h2 className="mb-2 text-xs font-medium text-muted-foreground">
                {group.section ??
                  translate('auto.components.TaskPage.statusMdUnsectioned', 'Unsectioned')}
              </h2>
              <div className="flex flex-col gap-1">
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                    style={{ paddingLeft: `${8 + task.depth * 16}px` }}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="mt-1 size-2 shrink-0 rounded-full border border-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-sm',
                        task.completed && 'text-muted-foreground line-through'
                      )}
                    >
                      {task.title}
                    </span>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onOpenTask(project, task)}
                        title={translate(
                          'auto.components.TaskPage.openStatusLine',
                          'Open in STATUS.md'
                        )}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void onWorkWithPi(project, task)}
                        title={translate('auto.components.TaskPage.workWithPi', 'Work with Pi')}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void copyTask(task)}
                        title={translate('auto.components.TaskPage.copyTask', 'Copy')}
                      >
                        {copiedId === task.id ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Clipboard className="size-3.5" />
                        )}
                      </Button>
                      {onDelegate ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelegate(project, task)}
                          title={translate(
                            'auto.components.TaskPage.delegateTask',
                            'Delegate to a partner'
                          )}
                        >
                          <Send className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : project.status === 'missing' ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {translate(
            'auto.components.TaskPage.statusMdMissingDescription',
            'This project has no STATUS.md file.'
          )}
        </p>
      ) : project.status === 'unavailable' ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {translate(
            'auto.components.TaskPage.statusMdUnavailableDescription',
            'This project is on a remote host and cannot be read here.'
          )}
        </p>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {translate('auto.components.TaskPage.statusMdNoMatches', 'No tasks match these filters.')}
        </p>
      )}
    </section>
  )
}
