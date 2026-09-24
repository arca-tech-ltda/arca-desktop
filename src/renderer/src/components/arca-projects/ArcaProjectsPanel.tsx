import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { ArcaProjectCandidate } from '../../../../shared/arca-projects-types'

type RowStatus = {
  state: 'idle' | 'cloning' | 'added' | 'error'
  detail?: string
  percent?: number
}

export function ArcaProjectsPanel({ onAdded }: { onAdded?: () => void }): React.JSX.Element {
  const addRepoPath = useAppStore((state) => state.addRepoPath)
  const fetchRepos = useAppStore((state) => state.fetchRepos)
  const [projects, setProjects] = useState<ArcaProjectCandidate[]>([])
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [activeName, setActiveName] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const result = await window.api.repos.listArcaProjects()
    if (result.ok) {
      setProjects(result.projects)
    } else {
      setLoadError(
        result.reason === 'gh_missing' || result.reason === 'gh_auth'
          ? translate(
              'components.arcaProjects.ghRequired',
              'GitHub CLI is unavailable or not authenticated. Install gh, run “gh auth login”, then try again.'
            )
          : result.message
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => void load(), [load])
  useEffect(() => {
    if (!activeName) {
      return
    }
    return window.api.repos.onCloneProgress((progress) => {
      setStatuses((current) => ({
        ...current,
        [activeName]: { state: 'cloning', detail: progress.phase, percent: progress.percent }
      }))
    })
  }, [activeName])

  const selected = useMemo(() => projects.filter((project) => project.selected), [projects])
  const updateProject = (name: string, updates: Partial<ArcaProjectCandidate>): void => {
    setProjects((current) =>
      current.map((project) => (project.name === name ? { ...project, ...updates } : project))
    )
  }

  const addSelected = async (): Promise<void> => {
    if (adding) {
      return
    }
    setAdding(true)
    let addedAny = false
    for (const project of selected) {
      try {
        const inspection = await window.api.repos.inspectArcaProjectDestination({
          destination: project.destination
        })
        if (inspection.diskState === 'conflict') {
          throw new Error(inspection.diskError ?? 'The destination cannot be used.')
        }
        if (inspection.diskState === 'arca_repo') {
          setStatuses((current) => ({
            ...current,
            [project.name]: {
              state: 'cloning',
              detail: translate('components.arcaProjects.registering', 'Registering…')
            }
          }))
          const repo = await addRepoPath(project.destination, 'git')
          if (!repo) {
            throw new Error('Could not register the repository.')
          }
        } else {
          setActiveName(project.name)
          setStatuses((current) => ({
            ...current,
            [project.name]: {
              state: 'cloning',
              detail: translate('components.arcaProjects.cloning', 'Cloning…'),
              percent: 0
            }
          }))
          await window.api.repos.clone({ url: project.url, destination: project.destination })
        }
        addedAny = true
        setStatuses((current) => ({ ...current, [project.name]: { state: 'added' } }))
      } catch (error) {
        setStatuses((current) => ({
          ...current,
          [project.name]: {
            state: 'error',
            detail: error instanceof Error ? error.message : String(error)
          }
        }))
      } finally {
        setActiveName(null)
      }
    }
    if (addedAny) {
      await fetchRepos()
      await window.api.onboarding.update({ checklist: { addedRepo: true } })
      onAdded?.()
    }
    setAdding(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {translate('components.arcaProjects.loading', 'Loading ARCA projects…')}
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-muted/25 p-4 text-sm">
        <div className="flex gap-2 text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{loadError}</span>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 size-4" />
          {translate('components.arcaProjects.retry', 'Try again')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="scrollbar-sleek max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {projects.map((project) => {
          const status = statuses[project.name] ?? { state: 'idle' as const }
          return (
            <div
              key={project.name}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-3"
            >
              <Checkbox
                checked={project.selected}
                disabled={adding || status.state === 'added'}
                onCheckedChange={(checked) =>
                  updateProject(project.name, { selected: checked === true })
                }
                aria-label={translate('components.arcaProjects.select', 'Select {{value0}}', {
                  value0: project.name
                })}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{project.name}</span>
                  {project.catalogued ? (
                    <span className="text-xs text-muted-foreground">
                      {translate('components.arcaProjects.catalogued', 'catalogued')}
                    </span>
                  ) : null}
                </div>
                {project.description ? (
                  <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                ) : null}
              </div>
              <div />
              <Input
                value={project.destination}
                disabled={adding || status.state === 'added'}
                onChange={(event) =>
                  updateProject(project.name, { destination: event.target.value })
                }
                aria-label={translate(
                  'components.arcaProjects.destination',
                  'Destination for {{value0}}',
                  { value0: project.name }
                )}
              />
              <div />
              <ProjectStatus project={project} status={status} />
            </div>
          )
        })}
      </div>
      <Button disabled={adding || selected.length === 0} onClick={() => void addSelected()}>
        {adding ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
        {translate('components.arcaProjects.addSelected', 'Add selected')}
      </Button>
    </div>
  )
}

function ProjectStatus({
  project,
  status
}: {
  project: ArcaProjectCandidate
  status: RowStatus
}): React.JSX.Element {
  if (status.state === 'added') {
    return (
      <span className="flex items-center gap-1 text-xs text-status-success">
        <CheckCircle2 className="size-3.5" />
        {translate('components.arcaProjects.added', 'Added')}
      </span>
    )
  }
  if (status.state === 'cloning') {
    return (
      <span className="text-xs text-muted-foreground">
        {status.detail}
        {status.percent !== undefined ? ` ${status.percent}%` : ''}
      </span>
    )
  }
  if (status.state === 'error' || project.diskState === 'conflict') {
    return <span className="text-xs text-destructive">{status.detail ?? project.diskError}</span>
  }
  if (project.diskState === 'arca_repo') {
    return (
      <span className="text-xs text-muted-foreground">
        {translate('components.arcaProjects.onDisk', 'Already on disk')}
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      {translate('components.arcaProjects.ready', 'Ready to clone')}
    </span>
  )
}
