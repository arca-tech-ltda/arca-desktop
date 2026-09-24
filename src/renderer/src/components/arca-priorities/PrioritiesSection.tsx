import { useEffect, useState } from 'react'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { PriorityRow } from './PriorityRow'
import { usePriorityActions } from './usePriorityActions'

export function PrioritiesSection(): React.JSX.Element | null {
  const [projects, setProjects] = useState<ArcaPriorityProject[]>([])
  const { openStatus, work } = usePriorityActions()
  useEffect(() => {
    const refresh = (): void => {
      void window.api.arcaPriorities
        .list()
        .then(setProjects)
        .catch(() => setProjects([]))
    }
    refresh()
    return window.api.arcaPriorities.onChange(refresh)
  }, [])
  if (projects.length === 0) {
    return null
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {translate('auto.components.priorities.title', 'Priorities')}
      </h2>
      {projects.map((project) => (
        <PriorityRow
          key={project.projectId}
          project={project}
          onOpenStatus={openStatus}
          onWork={(item) => void work(item)}
        />
      ))}
    </section>
  )
}
