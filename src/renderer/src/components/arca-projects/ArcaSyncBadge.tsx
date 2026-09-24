import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ArcaSyncRow } from '../../../../shared/arca-projects-sync'
import { useArcaProjectsSync } from './use-arca-projects-sync'

export function arcaSyncLabel(row: ArcaSyncRow): string {
  switch (row.state) {
    case 'updated':
      return translate('arcaSync.updated', 'Up to date')
    case 'missing':
      return translate('arcaSync.missing', 'Not on this computer')
    case 'dirty':
      return translate('arcaSync.dirty', 'Local changes')
    case 'branch':
      return translate('arcaSync.branch', 'Non-default branch')
    case 'error':
      return translate('arcaSync.error', 'Sync error')
    case 'ahead':
      return translate('arcaSync.ahead', '↑{{count}} ahead', { count: row.ahead ?? 0 })
    case 'behind':
      return translate('arcaSync.behind', '↓{{behind}} behind · ↑{{ahead}} ahead', {
        behind: row.behind ?? 0,
        ahead: row.ahead ?? 0
      })
  }
}
export function ArcaSyncBadge({ repo }: { repo: Repo }): React.JSX.Element | null {
  const status = useArcaProjectsSync()
  const row = status.projects.find((project) => project.repoId === repo.id)
  if (!row || getRepoExecutionHostId(repo) !== 'local') {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Badge variant="outline">{arcaSyncLabel(row)}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{row.error ?? `${row.repoKey} — ${arcaSyncLabel(row)}`}</TooltipContent>
    </Tooltip>
  )
}
