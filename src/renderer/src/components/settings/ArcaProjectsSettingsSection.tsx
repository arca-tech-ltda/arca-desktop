import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'
import { useArcaProjectsSync } from '../arca-projects/use-arca-projects-sync'
import { arcaSyncLabel } from '../arca-projects/ArcaSyncBadge'
import { ArcaSyncMissing } from '../arca-projects/ArcaSyncMissing'

export function ArcaProjectsSettingsSection(): React.JSX.Element {
  const status = useArcaProjectsSync()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function action(run: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await run()
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader title={translate('arcaSync.title', 'ARCA Projects')} />
      <SettingsSwitchRow
        label={translate('arcaSync.autoUpdate', 'Keep projects updated automatically')}
        checked={status.autoUpdate}
        disabled={busy}
        onChange={() =>
          void action(() => window.api.arcaProjectsSync.setAutoUpdate(!status.autoUpdate))
        }
      />
      <p className="text-xs text-muted-foreground">
        {translate('arcaSync.source', 'Catalog sources: {{sources}} · Last sync: {{last}}', {
          sources: status.sources.join(', ') || '—',
          last: status.lastSync ? new Date(status.lastSync).toLocaleString() : '—'
        })}
      </p>
      <Button
        variant="outline"
        disabled={status.running || busy}
        onClick={() => void action(() => window.api.arcaProjectsSync.syncNow())}
      >
        {translate('arcaSync.syncNow', 'Sync now')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status.errors.map((message) => (
        <p key={message} className="text-xs text-muted-foreground">
          {message}
        </p>
      ))}
      <ArcaSyncMissing />
      <ul className="space-y-3">
        {status.projects.map((project) => (
          <li key={project.repoKey} className="text-sm">
            <div>
              {project.repoKey} — {arcaSyncLabel(project)}
            </div>
            <div className="text-xs text-muted-foreground">
              {project.diskPath ?? project.destination} · {project.source} ·{' '}
              {project.repoId
                ? translate('arcaSync.registered', 'Registered in app')
                : translate('arcaSync.unregistered', 'Not registered in app')}
            </div>
            {project.error && <p className="text-xs text-destructive">{project.error}</p>}
          </li>
        ))}
      </ul>
      {status.outside.length > 0 && (
        <>
          <h3 className="text-sm font-medium">
            {translate('arcaSync.outside', 'Found outside the catalog')}
          </h3>
          <ul className="space-y-2">
            {status.outside.map((repo) => (
              <li key={repo.path} className="text-xs text-muted-foreground">
                {repo.repoKey} — {repo.path}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
