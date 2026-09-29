import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ArcaSyncRow } from '../../../../shared/arca-projects-sync'
import { useArcaProjectsSync } from './use-arca-projects-sync'

export function arcaSyncLabel(row: ArcaSyncRow): string {
  switch (row.state) {
    case 'updated':
      return translate('arcaSync.updated', 'Up to date')
    case 'missing':
      return translate('arcaSync.missing', 'Not on this computer')
    case 'cloning':
      return translate('arcaSync.cloning', 'Downloading')
    case 'conflict':
      return translate('arcaSync.conflict', 'Destination conflict')
    case 'inaccessible':
      return translate('arcaSync.inaccessible', 'No access')
    case 'paused':
      return translate('arcaSync.paused', 'Paused: low disk space')
    case 'dirty':
      return withBehind(translate('arcaSync.dirty', 'Local changes'), row)
    case 'branch':
      return withBehind(translate('arcaSync.branch', 'Non-default branch'), row)
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

function withBehind(label: string, row: ArcaSyncRow): string {
  return row.behind && row.behind > 0
    ? `${label} · ${translate('arcaSync.behind', '↓{{behind}} behind · ↑{{ahead}} ahead', {
        behind: row.behind,
        ahead: row.ahead ?? 0
      })}`
    : label
}

// Why: "updated" is the resting state of every synced project, so naming it in the
// header only competes with the project name. Only states asking for action show.
export function isAttentionArcaSyncState(state: ArcaSyncRow['state']): boolean {
  return state !== 'updated'
}

function isFailedArcaSyncState(state: ArcaSyncRow['state']): boolean {
  return state === 'error' || state === 'inaccessible' || state === 'conflict'
}

export function ArcaSyncBadge({ repo }: { repo: Repo }): React.JSX.Element | null {
  const status = useArcaProjectsSync()
  const row = status.projects.find((project) => project.repoId === repo.id)
  if (!row || getRepoExecutionHostId(repo) !== 'local') {
    return null
  }
  if (!isAttentionArcaSyncState(row.state)) {
    return null
  }
  const label = arcaSyncLabel(row)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-arca-sync-indicator={row.state}
          aria-label={label}
          className={cn(
            'min-w-0 shrink truncate text-[11px] leading-none',
            isFailedArcaSyncState(row.state) ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap break-words">
        {row.error?.trim() || `${row.repoKey} — ${arcaSyncLabel(row)}`}
      </TooltipContent>
    </Tooltip>
  )
}
