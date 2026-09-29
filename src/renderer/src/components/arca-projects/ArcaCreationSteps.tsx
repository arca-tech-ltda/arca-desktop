import { AlertCircle, Check, LoaderCircle, MinusCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ArcaCreationStep } from '../../../../shared/arca-project-creation'
import { arcaCreationStepLabel } from './arca-creation-step-labels'

function StepIcon({ state }: { state: ArcaCreationStep['state'] }): React.JSX.Element {
  if (state === 'running') {
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
  }
  if (state === 'done') {
    return <Check className="size-3.5 shrink-0 text-status-success" />
  }
  if (state === 'failed') {
    return <AlertCircle className="size-3.5 shrink-0 text-destructive" />
  }
  return <MinusCircle className="size-3.5 shrink-0 text-muted-foreground" />
}

export function ArcaCreationSteps({
  steps,
  publishing
}: {
  steps: ArcaCreationStep[]
  publishing: boolean
}): React.JSX.Element {
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">
            <StepIcon state={step.state} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">{arcaCreationStepLabel(step.id, publishing)}</span>
            {step.id === 'mainframe' && step.state === 'skipped' ? (
              <span className="block text-xs text-muted-foreground">
                {translate(
                  'components.arcaProjects.create.mainframeSkipped',
                  'The Mainframe has no project-registration tool; it imports projects.json once the pull request is merged.'
                )}
              </span>
            ) : null}
            {step.detail ? (
              <span className="block break-words text-xs text-muted-foreground">{step.detail}</span>
            ) : null}
            {step.link ? (
              <a
                className="block break-all text-xs text-muted-foreground underline"
                href={step.link}
                target="_blank"
                rel="noreferrer"
              >
                {step.link}
              </a>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
