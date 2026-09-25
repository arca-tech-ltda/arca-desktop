import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { useAppStore } from '@/store'

type AppState = ReturnType<typeof useAppStore.getState>

export async function startPiOnStatusReference({
  repoId,
  branchName,
  prompt,
  createWorktree,
  cmdOverrides
}: {
  repoId: string
  branchName: string
  prompt: string
  createWorktree: AppState['createWorktree']
  cmdOverrides: NonNullable<AppState['settings']>['agentCmdOverrides'] | undefined
}): Promise<void> {
  const startupPlan = buildAgentStartupPlan({
    agent: 'pi',
    prompt,
    cmdOverrides: cmdOverrides ?? {},
    platform: getShortcutPlatform()
  })
  if (!startupPlan) {
    toast.error(translate('auto.components.TaskPage.piUnavailable', 'Pi is not available.'))
    return
  }
  await createWorktree(
    repoId,
    branchName,
    undefined,
    undefined,
    undefined,
    'unknown',
    undefined,
    undefined,
    undefined,
    undefined,
    'pi',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      command: startupPlan.launchCommand,
      launchConfig: startupPlan.launchConfig,
      launchAgent: 'pi',
      viewMode: 'terminal',
      ...(startupPlan.env ? { env: startupPlan.env } : {}),
      ...(startupPlan.launchToken ? { launchToken: startupPlan.launchToken } : {}),
      ...(startupPlan.startupCommandDelivery
        ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
        : {})
    }
  )
}
