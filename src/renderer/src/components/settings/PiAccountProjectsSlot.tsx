import { translate } from '@/i18n/i18n'
import { normalizeProjectPathKey } from '../../../../shared/pi-account-projects'
import type { PiAccount } from '../../../../shared/pi-accounts'
import { useAppStore } from '../../store'
import { Badge } from '../ui/badge'
import { rendererPathPlatform, usePiAccountProjects } from './use-pi-account-projects'

/** Known project names read better than stored path keys, which are folded on Windows. */
function projectLabel(
  pathKey: string,
  repos: readonly { path: string; displayName: string }[]
): string {
  const platform = rendererPathPlatform()
  const repo = repos.find((entry) => normalizeProjectPathKey(entry.path, platform) === pathKey)
  return repo?.displayName ?? pathKey.split(/[\\/]/u).findLast(Boolean) ?? pathKey
}

/** "Projects using this account"; hidden while the installed Pi has no per-project support. */
export function PiAccountProjectsSlot({
  account
}: {
  account: PiAccount
}): React.JSX.Element | null {
  const projects = usePiAccountProjects()
  const repos = useAppStore((state) => state.repos)
  const pinned = projects.projectsUsing(account.provider, account.name)
  if (!projects.supported || pinned.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        {translate('piAccounts.projectsUsing', 'Projects using this account:')}
      </span>
      {pinned.map((pathKey) => (
        <Badge key={pathKey} variant="outline" title={pathKey}>
          <span className="max-w-32 truncate">{projectLabel(pathKey, repos)}</span>
        </Badge>
      ))}
    </div>
  )
}
