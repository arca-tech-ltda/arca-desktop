import { translate } from '@/i18n/i18n'
import { ArcaProjectsDialog } from './ArcaProjectsDialog'
import { useArcaProjectsSync } from './use-arca-projects-sync'

export function ArcaSyncMissing(): React.JSX.Element | null {
  const status = useArcaProjectsSync()
  const count = status.projects.filter((project) => project.state === 'missing').length
  if (!count) {
    return null
  }
  return (
    <ArcaProjectsDialog
      label={translate(
        'arcaSync.cloneMissing',
        '{{count}} ARCA projects are not on this computer — Clone',
        { count }
      )}
    />
  )
}
