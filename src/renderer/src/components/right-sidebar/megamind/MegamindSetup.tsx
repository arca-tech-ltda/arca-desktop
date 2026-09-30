import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { OnboardingInlineCommandTerminal } from '../../onboarding/OnboardingInlineCommandTerminal'
import type { MegamindPrerequisites } from '../../../../../shared/arca-megamind'
import type { MegamindConnection } from './use-megamind-connection'

type SetupLine = {
  message: string
  tone: 'alert' | 'status'
  action?: { label: string; run: () => void; disabled?: boolean }
}

function connectionLine(connection: MegamindConnection): SetupLine | null {
  const { status, failed } = connection
  const connect = {
    label: translate('arca.megamind.connect', 'Connect to Megamind'),
    run: connection.start,
    disabled: connection.busy
  }
  if (status.state === 'pending') {
    return {
      tone: 'status',
      message: `${translate('arca.megamind.confirmCode', 'Confirm this code in Mainframe:')} ${status.userCode ?? ''}`,
      ...(status.verificationUri
        ? {
            action: {
              label: translate('arca.megamind.openMainframe', 'Open Mainframe'),
              run: () => void window.api.shell.openUrl(status.verificationUri ?? '')
            }
          }
        : {})
    }
  }
  if (status.state === 'expired') {
    return {
      tone: 'status',
      message: translate('arca.megamind.expired', 'Code expired. Connect again to retry.'),
      action: connect
    }
  }
  if (failed || status.state === 'error') {
    return {
      tone: 'alert',
      message: translate(
        'arca.megamind.connectionError',
        'Connection failed. Check your credentials and try again.'
      ),
      action: connect
    }
  }
  if (status.state !== 'connected') {
    return {
      tone: 'status',
      message: translate('arca.megamind.notConnected', 'Not connected'),
      action: connect
    }
  }
  return null
}

/** `--pi` on POSIX, `-Pi` on Windows; both from the arca repo this computer already has. */
export function piInstallCommand(requirements: MegamindPrerequisites): string {
  return requirements.windows
    ? `& "${requirements.repoPath}\\install.ps1" -Pi`
    : `"${requirements.repoPath}/install.sh" --pi`
}

function prerequisitesMessage(requirements: MegamindPrerequisites, remote: boolean): string {
  if (remote) {
    return translate(
      'arca.megamind.localInstaller',
      'Switch to the local environment to run this installer.'
    )
  }
  if (!requirements.installer) {
    return translate(
      'arca.megamind.installerMissing',
      'Installer not found in ~/ARCA/arca. Install the ARCA workspace first.'
    )
  }
  if (requirements.piArcaMissing) {
    return translate(
      'arca.megamind.piWithoutArcaPi',
      'Pi without ARCA Pi: run the installer so Megamind loads in Pi.'
    )
  }
  return requirements.mode === 'pi'
    ? translate(
        'arca.megamind.prerequisites',
        'Pi or its Megamind extension is missing on this computer.'
      )
    : translate(
        'arca.megamind.prerequisitesManaged',
        'Megamind is not set up for Claude Code or Codex on this computer.'
      )
}

/**
 * One line at the top of the panel, and only when something is in the way: the connection first,
 * then the install the agent link needs — the workspace one, or ARCA Pi when Pi is the agent here
 * and `~/.pi/agent` is not linked to the repo. `expanded` is the gear button, which shows the
 * line even when everything is in order so the device is still reachable.
 */
export function MegamindSetup({
  connection,
  expanded
}: {
  connection: MegamindConnection
  expanded: boolean
}): React.JSX.Element | null {
  const [requirements, setRequirements] = useState<MegamindPrerequisites | null>(null)
  const [install, setInstall] = useState<'workspace' | 'pi' | null>(null)
  const remote = useAppStore((state) => Boolean(state.settings?.activeRuntimeEnvironmentId))
  useEffect(() => {
    void window.api.arcaMegamind
      ?.prerequisites()
      .then(setRequirements)
      .catch(() => {})
  }, [])
  const workspaceLabel = translate('arca.megamind.install', 'Run workspace installer')
  const piLabel = translate('arca.megamind.installPi', 'Install ARCA Pi')
  const piMissing = requirements?.piArcaMissing === true
  const installerLabel = piMissing ? piLabel : workspaceLabel
  const missing = requirements && !(requirements.agent && requirements.installer)
  const line =
    connectionLine(connection) ??
    (missing && requirements
      ? {
          tone: 'status' as const,
          message: prerequisitesMessage(requirements, remote),
          action: {
            label: installerLabel,
            run: () => setInstall(piMissing ? 'pi' : 'workspace'),
            disabled: !requirements.installer || remote || install !== null
          }
        }
      : expanded
        ? {
            tone: 'status' as const,
            message: `${translate('arca.megamind.connectedAs', 'Connected as')} ${connection.status.device ?? ''}`,
            action: {
              label: translate('arca.megamind.manageDevices', 'Manage devices in Mainframe'),
              run: () => void window.api.arcaMegamind.openMainframeLogin()
            }
          }
        : null)
  if (!line) {
    return null
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-2">
      <div className="flex items-center gap-2">
        <p role={line.tone} className="min-w-0 flex-1 text-xs text-muted-foreground">
          {line.message}
        </p>
        {line.action && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={line.action.disabled}
            onClick={line.action.run}
          >
            {line.action.label}
          </Button>
        )}
      </div>
      {install && requirements && (
        <OnboardingInlineCommandTerminal
          command={
            install === 'pi'
              ? piInstallCommand(requirements)
              : requirements.windows
                ? '& "$HOME\\ARCA\\arca\\install.ps1" -Workspace'
                : '~/ARCA/arca/install.sh --workspace'
          }
          shellOverride={requirements?.windows ? 'powershell.exe' : undefined}
          forceHostRuntime
          worktreeId="megamind-workspace-installer"
          title={installerLabel}
          ariaLabel={installerLabel}
          onCommandFinished={() => {
            void window.api.arcaMegamind.prerequisites().then(setRequirements)
          }}
        />
      )}
    </div>
  )
}
