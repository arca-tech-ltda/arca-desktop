import { subscribeStatusMdChanges } from '@/components/task-page/status-md-subscription'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ListTodo } from 'lucide-react'
import type {
  StatusMdRecentTasks,
  StatusMdTaskProject
} from '../../../../preload/api/status-md-tasks-api'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useActiveWorktree } from '@/store/selectors'
import { useStatusMdTaskActions } from '@/components/task-page/useStatusMdTaskActions'
import { CurrentProjectPane } from './CurrentProjectPane'
import { PriorityRow } from './PriorityRow'
import { RecentTasksPane } from './RecentTasksPane'
import { selectCurrentStatusProject } from './priority-card-data'
import { usePriorityActions } from './usePriorityActions'

const COLLAPSED_KEY = 'arca.priority-card.collapsed'
const TAB_KEY = 'arca.priority-card.tab'
type CardTab = 'current' | 'recent' | 'priorities'
const EMPTY_RECENT: StatusMdRecentTasks = { open: [], completed: [] }

function savedTab(hasActiveProject: boolean): CardTab {
  const value = localStorage.getItem(TAB_KEY)
  if (value === 'current' || value === 'recent' || value === 'priorities') {
    return value
  }
  return hasActiveProject ? 'current' : 'recent'
}

export function PriorityCard(): React.JSX.Element | null {
  const activeWorktree = useActiveWorktree()
  const [priorities, setPriorities] = useState<ArcaPriorityProject[]>([])
  const [projects, setProjects] = useState<StatusMdTaskProject[]>([])
  const [recent, setRecent] = useState<StatusMdRecentTasks>(EMPTY_RECENT)
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [agents, setAgents] = useState<Record<string, unknown>[]>([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  const [tab, setTab] = useState<CardTab>(() => savedTab(Boolean(activeWorktree)))
  const priorityActions = usePriorityActions()
  const taskActions = useStatusMdTaskActions()
  const currentProject = useMemo(
    () => selectCurrentStatusProject(projects, activeWorktree),
    [activeWorktree, projects]
  )
  const currentPriority = useMemo(
    () => priorities.find((project) => project.repoId === currentProject?.repoId) ?? null,
    [currentProject?.repoId, priorities]
  )

  useEffect(() => {
    const refreshPriorities = (): void => {
      void window.api.arcaPriorities
        .list()
        .then(setPriorities)
        .catch(() => setPriorities([]))
    }
    const refreshTasks = (): void => {
      void Promise.all([window.api.statusMdTasks.list(), window.api.statusMdTasks.recent()])
        .then(([nextProjects, nextRecent]) => {
          setProjects(nextProjects)
          setRecent(nextRecent)
          setTasksLoaded(true)
        })
        .catch(() => {
          setProjects([])
          setRecent(EMPTY_RECENT)
          setTasksLoaded(true)
        })
    }
    refreshPriorities()
    refreshTasks()
    void window.api.arcaMegamind
      .agents()
      .then(setAgents)
      .catch(() => setAgents([]))
    const stopPriorities = window.api.arcaPriorities.onChange(refreshPriorities)
    const stopTasks = subscribeStatusMdChanges(refreshTasks)
    return () => {
      stopPriorities()
      stopTasks()
    }
  }, [])

  useEffect(() => {
    if (tasksLoaded && !currentProject && tab === 'current') {
      setTab('recent')
      localStorage.setItem(TAB_KEY, 'recent')
    }
  }, [currentProject, tab, tasksLoaded])

  if (projects.length === 0 && priorities.length === 0) {
    return null
  }

  const chooseTab = (next: CardTab): void => {
    setTab(next)
    localStorage.setItem(TAB_KEY, next)
  }
  const toggle = (): void => {
    setCollapsed((value) => {
      localStorage.setItem(COLLAPSED_KEY, String(!value))
      return !value
    })
  }

  const taskActionProps = {
    onOpen: taskActions.openStatusTask,
    onWork: taskActions.workWithPi,
    onCopy: taskActions.copyTask
  }

  return (
    <aside
      data-arca-priority-card
      className="fixed right-12 bottom-10 z-30 w-[380px] max-w-[calc(100vw-64px)] rounded-xl border border-border bg-card shadow-floating"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <ListTodo className="size-4 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">
          {translate('auto.components.priorities.cardTitle', 'Project tasks')}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggle}
          aria-label={
            collapsed
              ? translate('auto.components.priorities.expand', 'Expand priorities')
              : translate('auto.components.priorities.collapse', 'Collapse priorities')
          }
        >
          {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
      </div>
      {!collapsed ? (
        <>
          <div className="flex gap-1 border-y border-border px-2 py-1">
            {currentProject ? (
              <button
                type="button"
                className={cn(
                  'rounded-md px-2 py-1 text-xs',
                  tab === 'current' ? 'bg-accent font-medium' : 'text-muted-foreground'
                )}
                onClick={() => chooseTab('current')}
              >
                {translate('auto.components.priorities.currentProject', 'This project')}
              </button>
            ) : null}
            <button
              type="button"
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                tab === 'recent' ? 'bg-accent font-medium' : 'text-muted-foreground'
              )}
              onClick={() => chooseTab('recent')}
            >
              {translate('auto.components.priorities.recent', 'Recent')}
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                tab === 'priorities' ? 'bg-accent font-medium' : 'text-muted-foreground'
              )}
              onClick={() => chooseTab('priorities')}
            >
              {translate('auto.components.priorities.title', 'Priorities')}
            </button>
          </div>
          <div className="scrollbar-sleek max-h-[min(60vh,520px)] overflow-y-auto">
            {tab === 'current' && currentProject ? (
              <CurrentProjectPane
                project={currentProject}
                priority={currentPriority}
                agents={agents}
                {...taskActionProps}
              />
            ) : null}
            {tab === 'recent' ? <RecentTasksPane recent={recent} {...taskActionProps} /> : null}
            {tab === 'priorities' ? (
              <div className="space-y-2 p-2">
                {priorities.map((priority) => (
                  <PriorityRow
                    key={priority.projectId}
                    project={priority}
                    statusProject={projects.find((project) => project.repoId === priority.repoId)}
                    onOpenStatus={priorityActions.openStatus}
                    onWork={(item) => void priorityActions.work(item)}
                    onOpenTask={taskActions.openStatusTask}
                    onWorkTask={taskActions.workWithPi}
                    onCopyTask={taskActions.copyTask}
                    agents={agents}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  )
}
