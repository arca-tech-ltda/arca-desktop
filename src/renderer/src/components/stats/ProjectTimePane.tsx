import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { aggregateProjectTime, type ProjectTimeEntry } from '../../../../shared/project-time'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { StatCard } from './StatCard'
import { formatProjectDuration } from './project-time-duration'

export function ProjectTimePane(): React.JSX.Element {
  const [days, setDays] = useState<1 | 7>(1)
  const [entries, setEntries] = useState<ProjectTimeEntry[]>([])
  const [failed, setFailed] = useState(false)
  const repos = useAppStore((state) => state.repos)
  useEffect(() => {
    let disposed = false
    const refresh = () => {
      void window.api.stats
        .getProjectTime()
        .then((data) => {
          if (!disposed) {
            setEntries(data)
            setFailed(false)
          }
        })
        .catch(() => {
          if (!disposed) {
            setFailed(true)
          }
        })
    }
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
  const rows = aggregateProjectTime(entries, days)
  const total = rows.reduce((sum, row) => sum + row.seconds, 0)
  return (
    <section className="space-y-3" aria-labelledby="project-time-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="project-time-title" className="text-sm font-semibold text-foreground">
          {translate('projectTime.title', 'Time by project')}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-pressed={days === 1} onClick={() => setDays(1)}>
            {translate('projectTime.today', 'Today')}
          </Button>
          <Button variant="outline" size="sm" aria-pressed={days === 7} onClick={() => setDays(7)}>
            {translate('projectTime.week', 'Last 7 days')}
          </Button>
        </div>
      </div>
      <StatCard
        label={translate('projectTime.total', 'Total active time')}
        value={formatProjectDuration(total)}
        icon={<Clock className="size-4" />}
      />
      {failed ? (
        <p className="text-sm text-muted-foreground">
          {translate('projectTime.error', 'Could not load project time.')}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate('projectTime.empty', 'Use a project workspace to start tracking active time.')}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.repoId} className="space-y-2">
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate">
                  {repos.find((repo) => repo.id === row.repoId)?.displayName ?? row.displayName}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatProjectDuration(row.seconds)}
                </span>
              </div>
              <Progress value={(row.seconds / total) * 100} aria-label={row.displayName} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
