import { useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  ArcaCreateProjectForm,
  arcaProjectNameError,
  type ArcaCreateProjectFormValue
} from './ArcaCreateProjectForm'
import { ArcaCreationSteps } from './ArcaCreationSteps'
import { useArcaProjectCreation } from './use-arca-project-creation'
import type { ArcaProjectType } from '../../../../shared/arca-project-creation'

export type ArcaCreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present for "Publish to ARCA": the existing folder becomes the repository. */
  sourcePath?: string
  initialName?: string
  initialType?: ArcaProjectType
  originUrl?: string
  onCreated?: () => void
}

function initialValue(props: ArcaCreateProjectDialogProps): ArcaCreateProjectFormValue {
  return {
    name: props.initialName ?? '',
    type: props.initialType ?? 'clientes',
    title: '',
    description: '',
    moveToArcaRoot: false,
    remoteName: props.originUrl ? 'arca' : 'origin'
  }
}

export function ArcaCreateProjectDialog(props: ArcaCreateProjectDialogProps): React.JSX.Element {
  const publishing = Boolean(props.sourcePath)
  const [value, setValue] = useState<ArcaCreateProjectFormValue>(() => initialValue(props))
  const fetchRepos = useAppStore((state) => state.fetchRepos)
  const { running, steps, result, start, reset } = useArcaProjectCreation()

  useEffect(() => {
    if (props.open) {
      setValue(initialValue(props))
      reset()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on `open` alone: re-seeding on every prop identity change would wipe what the user typed.
  }, [props.open])

  const nameError = arcaProjectNameError(value.name)
  const submit = async (): Promise<void> => {
    const created = await start({
      name: value.name.trim(),
      type: value.type,
      description: value.description.trim(),
      ...(value.title.trim() ? { title: value.title.trim() } : {}),
      ...(props.sourcePath ? { sourcePath: props.sourcePath } : {}),
      ...(publishing && value.moveToArcaRoot ? { moveToArcaRoot: true } : {}),
      ...(publishing && value.remoteName ? { remoteName: value.remoteName.trim() } : {})
    })
    if (created.repoId) {
      await fetchRepos()
      props.onCreated?.()
    }
    void window.api.arcaProjectsSync.syncNow().catch(() => {})
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !running && props.onOpenChange(open)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {publishing
              ? translate('components.arcaProjects.create.publishTitle', 'Publish to ARCA')
              : translate('components.arcaProjects.create.title', 'New ARCA project')}
          </DialogTitle>
          <DialogDescription>
            {publishing
              ? translate(
                  'components.arcaProjects.create.publishDescription',
                  'Creates a private repository in arca-tech-ltda, pushes this folder to it and adds it to the ARCA catalog.'
                )
              : translate(
                  'components.arcaProjects.create.description',
                  'Creates a private repository in arca-tech-ltda, clones it under ~/ARCA and adds it to the ARCA catalog.'
                )}
          </DialogDescription>
        </DialogHeader>
        {steps.length || result ? (
          <div className="space-y-3">
            <ArcaCreationSteps steps={steps} publishing={publishing} />
            {result?.error ? (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/25 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block break-words">{result.error}</span>
                  {result.resume ? (
                    <span className="block text-xs text-muted-foreground">{result.resume}</span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {result?.ok && result.pullRequestUrl && !result.merged ? (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'components.arcaProjects.create.pullRequestOpen',
                  'The catalog pull request is open and waiting for someone who can merge it: {{value0}}',
                  { value0: result.pullRequestUrl }
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <ArcaCreateProjectForm
            value={value}
            onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
            disabled={running}
            publishing={publishing}
            {...(props.originUrl ? { originUrl: props.originUrl } : {})}
          />
        )}
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => props.onOpenChange(false)}>
              {translate('components.arcaProjects.create.close', 'Close')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={running || Boolean(nameError)}
              onClick={() => void submit()}
            >
              {running ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
              {publishing
                ? translate('components.arcaProjects.create.publishAction', 'Publish')
                : translate('components.arcaProjects.create.createAction', 'Create project')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
