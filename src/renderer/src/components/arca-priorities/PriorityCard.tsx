import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Target } from 'lucide-react'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PriorityRow } from './PriorityRow'
import { usePriorityActions } from './usePriorityActions'

const COLLAPSED_KEY = 'arca.priority-card.collapsed'

export function PriorityCard(): React.JSX.Element | null {
  const [projects, setProjects] = useState<ArcaPriorityProject[]>([])
  const [agents, setAgents] = useState<Record<string, unknown>[]>([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  const [celebrate, setCelebrate] = useState(false)
  const previous = useRef(
    new Map<string, { completed: boolean; next: string | null }>()
  )
  const { openStatus, work } = usePriorityActions()

  useEffect(() => {
    const refresh = (): void => {
      void window.api.arcaPriorities
        .list()
        .then((next) => {
          if (
            next.some((item) => {
              const before = previous.current.get(item.projectId)
              return (
                (item.completed && before?.completed === false) ||
                (before?.next !== null && item.title === before?.next)
              )
            })
          ) {
            setCelebrate(true)
            window.setTimeout(() => setCelebrate(false), 1400)
          }
          previous.current = new Map(
            next.map((item) => [
              item.projectId,
              {
                completed: item.completed,
                next: item.queue[0]?.title ?? null
              }
            ])
          )
          setProjects(next)
        })
        .catch(() => setProjects([]))
    }
    refresh()
    void window.api.arcaMegamind
      .agents()
      .then(setAgents)
      .catch(() => setAgents([]))
    return window.api.arcaPriorities.onChange(refresh)
  }, [])

  const top = useMemo(() => projects.find((project) => project.title !== null), [projects])
  if (!top && projects.length === 0) {
    return null
  }

  const toggle = (): void => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  return (
    <aside
      className={cn(
        'fixed bottom-10 right-4 z-30 w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card shadow-floating motion-reduce:transition-none',
        celebrate && 'animate-pulse'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Target className="size-4 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">
          {translate('auto.components.priorities.title', 'Priorities')}
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
      {collapsed ? (
        top ? (
          <div className="border-t border-border px-3 py-2 text-xs">
            <span className="font-medium">{top.name}</span> · {top.title}
          </div>
        ) : null
      ) : (
        <div className="scrollbar-sleek max-h-[min(65vh,560px)] space-y-2 overflow-y-auto border-t border-border p-2">
          {projects.map((project) => (
            <PriorityRow
              key={project.projectId}
              project={project}
              onOpenStatus={openStatus}
              onWork={(item) => void work(item)}
              agents={agents}
            />
          ))}
        </div>
      )}
    </aside>
  )
}
