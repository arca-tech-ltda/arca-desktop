import { useCallback, useState } from 'react'
import { Check, Loader2, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { useCliRegistrationStatus } from '@/hooks/useCliRegistrationStatus'
import {
  DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
  runOnboardingFeatureSetup
} from '../onboarding/onboarding-feature-setup'
import { FullDiskAccessSetupPrompt } from './FullDiskAccessSetupPrompt'

function getRegistrationStatusLabel(args: { checking: boolean; registered: boolean }): string {
  if (args.checking) {
    return translate('components.featureWall.arcaCli.statusChecking', 'Checking')
  }
  return args.registered
    ? translate('components.featureWall.arcaCli.statusRegistered', 'Registered')
    : translate('components.featureWall.arcaCli.statusNotRegistered', 'Not registered')
}

/** Pi-authority replacement for the Orca skill checklist: the step only registers the shell command. */
export function ArcaCliSetupAction(): React.JSX.Element {
  const { checking, checked, registered, refresh, status } = useCliRegistrationStatus()
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const [busy, setBusy] = useState(false)

  const handleInstall = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await runOnboardingFeatureSetup(
        DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
        undefined,
        activeSkillRuntime
      )
      const firstWarning = result.warnings[0]
      if (firstWarning) {
        toast.warning(
          translate('components.featureWall.arcaCli.warningTitle', 'CLI setup needs attention'),
          { description: firstWarning.message }
        )
      } else {
        toast.success(
          translate('components.featureWall.arcaCli.successTitle', 'ARCA shell command registered')
        )
      }
    } catch (error) {
      toast.error(
        translate('components.featureWall.arcaCli.failureTitle', 'CLI registration failed'),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setBusy(false)
      refresh()
    }
  }, [activeSkillRuntime, refresh])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">
            <Terminal className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {translate('components.featureWall.arcaCli.title', 'ARCA shell command')}
              </span>
              <Badge variant={registered ? 'secondary' : 'outline'}>
                {getRegistrationStatusLabel({
                  checking: checking || !checked,
                  registered
                })}
              </Badge>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              {status?.detail ??
                translate(
                  'components.featureWall.arcaCli.description',
                  'Adds the `arca` command to your shell so ARCA can be driven from the terminal.'
                )}
            </p>
            {status?.commandPath ? (
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  {status.commandPath}
                </code>
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant={registered ? 'outline' : 'default'}
          size="sm"
          className="shrink-0"
          disabled={busy || registered || !checked}
          onClick={() => void handleInstall()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : registered ? (
            <Check className="size-3.5" />
          ) : (
            <Terminal className="size-3.5" />
          )}
          {registered
            ? translate('components.featureWall.arcaCli.installedAction', 'Installed')
            : translate('components.featureWall.arcaCli.installAction', 'Install CLI')}
        </Button>
      </div>
      <FullDiskAccessSetupPrompt />
    </div>
  )
}
