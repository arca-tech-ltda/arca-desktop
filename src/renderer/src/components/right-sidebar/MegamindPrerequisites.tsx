import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { OnboardingInlineCommandTerminal } from '../onboarding/OnboardingInlineCommandTerminal'
import type { MegamindPrerequisites as Prerequisites } from '../../../../shared/arca-megamind'

export function MegamindPrerequisites(): React.JSX.Element | null {
  const [requirements, setRequirements] = useState<Prerequisites | null>(null)
  const [install, setInstall] = useState(false)
  const remote = useAppStore((state) => Boolean(state.settings?.activeRuntimeEnvironmentId))
  useEffect(() => {
    void window.api.arcaMegamind
      ?.prerequisites()
      .then(setRequirements)
      .catch(() => {})
  }, [])
  if (!requirements || (requirements.pi && requirements.extension && requirements.installer)) {
    return null
  }
  const label = translate('arca.megamind.install', 'Run workspace installer')
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2 text-xs">
      {(!requirements.pi || !requirements.extension) && (
        <p>
          {translate(
            'arca.megamind.prerequisites',
            'Pi or its Megamind extension is missing on this computer.'
          )}
        </p>
      )}
      {!requirements.installer && (
        <p>
          {translate(
            'arca.megamind.installerMissing',
            'Installer not found in ~/ARCA/arca. Install the ARCA workspace first.'
          )}
        </p>
      )}
      {remote && (
        <p>
          {translate(
            'arca.megamind.localInstaller',
            'Switch to the local environment to run this installer.'
          )}
        </p>
      )}
      <Button
        size="xs"
        variant="outline"
        disabled={!requirements.installer || remote || install}
        onClick={() => setInstall(true)}
      >
        {label}
      </Button>
      {install && (
        <OnboardingInlineCommandTerminal
          command={
            requirements.windows
              ? '& "$HOME\\ARCA\\arca\\install.ps1" -Workspace'
              : '~/ARCA/arca/install.sh --workspace'
          }
          shellOverride={requirements.windows ? 'powershell.exe' : undefined}
          forceHostRuntime
          worktreeId="megamind-workspace-installer"
          title={label}
          ariaLabel={label}
          onCommandFinished={() => {
            void window.api.arcaMegamind.prerequisites().then(setRequirements)
          }}
        />
      )}
    </div>
  )
}
