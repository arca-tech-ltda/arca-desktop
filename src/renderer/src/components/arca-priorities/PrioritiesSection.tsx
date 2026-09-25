import { subscribeStatusMdChanges } from '@/components/task-page/status-md-subscription'
import { useEffect, useState } from 'react'
import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { useStatusMdTaskActions } from '@/components/task-page/useStatusMdTaskActions'
import { PriorityRow } from './PriorityRow'
import { usePriorityActions } from './usePriorityActions'

export function PrioritiesSection(): React.JSX.Element | null {
  const [priorities, setPriorities] = useState<ArcaPriorityProject[]>([])
  const [projects, setProjects] = useState<StatusMdTaskProject[]>([])
  const [agents, setAgents] = useState<Record<string, unknown>[]>([])
  const priorityActions = usePriorityActions()
  const taskActions = useStatusMdTaskActions()

  useEffect(() => {
    const refreshPriorities = (): void => {
      void window.api.arcaPriorities
        .list()
        .then(setPriorities)
        .catch(() => setPriorities([]))
    }
    const refreshTasks = (): void => {
      void window.api.statusMdTasks
        .list()
        .then(setProjects)
        .catch(() => setProjects([]))
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

  if (priorities.length === 0) {
    return null
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {translate('auto.components.priorities.title', 'Priorities')}
      </h2>
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
    </section>
  )
}
