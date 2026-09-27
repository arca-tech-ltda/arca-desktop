import { LoaderCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useArcaProjectsSync } from './use-arca-projects-sync'

export function ArcaSyncProgress(): React.JSX.Element | null {
  const status = useArcaProjectsSync()
  if (!status.cloneProgress && !status.diskWarning) {return null}
  if (status.diskWarning) {
    return <div className="px-3 py-1 text-xs text-destructive">{status.diskWarning}</div>
  }
  const progress = status.cloneProgress
  if (!progress) {return null}
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" />
      <span className="truncate">
        {translate('arcaSync.downloading', 'Downloading ARCA projects {{current}}/{{total}} — {{name}} {{percent}}%', {
          current: progress.current,
          total: progress.total,
          name: progress.name,
          percent: progress.percent
        })}
      </span>
    </div>
  )
}
