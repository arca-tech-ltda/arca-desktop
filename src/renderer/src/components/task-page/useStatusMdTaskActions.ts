import { useCallback } from 'react'
import { toast } from 'sonner'
import type { StatusMdTaskProject } from '../../../../preload/api/status-md-tasks-api'
import type { StatusMdTask } from '../../../../shared/status-md-tasks'
import { translate } from '@/i18n/i18n'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { useAppStore } from '@/store'

function clientPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Windows')) {
    return 'win32'
  }
  return navigator.userAgent.includes('Mac') ? 'darwin' : 'linux'
}

export function statusMdTaskPrompt(task: StatusMdTask, project: StatusMdTaskProject): string {
  return [
    `Work on this task from ${project.name}'s STATUS.md: ${task.title}`,
    task.section ? `Section: ${task.section}` : null,
    `Reference: STATUS.md line ${task.lineNumber}`
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function useStatusMdTaskActions(): {
  openStatusTask: (project: StatusMdTaskProject, task: StatusMdTask) => void
  workWithPi: (project: StatusMdTaskProject, task: StatusMdTask) => Promise<void>
  copyTask: (task: StatusMdTask) => Promise<void>
} {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const closeTaskPage = useAppStore((state) => state.closeTaskPage)
  const openFile = useAppStore((state) => state.openFile)
  const setEditorCursorLine = useAppStore((state) => state.setEditorCursorLine)
  const createWorktree = useAppStore((state) => state.createWorktree)
  const settings = useAppStore((state) => state.settings)

  const openStatusTask = useCallback(
    (project: StatusMdTaskProject, task: StatusMdTask): void => {
      if (project.status !== 'available') {
        return
      }
      const worktree = worktreesByRepo[project.repoId]?.find(
        (candidate) => candidate.path === project.path
      )
      const fileId = openFile(
        {
          filePath: project.statusPath,
          relativePath: 'STATUS.md',
          worktreeId: worktree?.id ?? `${project.repoId}::${project.path}`,
          language: 'markdown',
          mode: 'edit',
          readOnly: true
        },
        { preview: false, focusEditor: true }
      )
      setEditorCursorLine(fileId, task.lineNumber)
      closeTaskPage()
    },
    [closeTaskPage, openFile, setEditorCursorLine, worktreesByRepo]
  )

  const workWithPi = useCallback(
    async (project: StatusMdTaskProject, task: StatusMdTask): Promise<void> => {
      const repo = repos.find((candidate) => candidate.id === project.repoId)
      if (!repo || project.status !== 'available') {
        return
      }
      const startupPlan = buildAgentStartupPlan({
        agent: 'pi',
        prompt: statusMdTaskPrompt(task, project),
        cmdOverrides: settings?.agentCmdOverrides ?? {},
        platform: clientPlatform()
      })
      if (!startupPlan) {
        toast.error(translate('auto.components.TaskPage.piUnavailable', 'Pi is not available.'))
        return
      }
      const slug = task.title
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
      try {
        await createWorktree(
          repo.id,
          `status-${slug || 'task'}-${task.lineNumber}`,
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
      } catch {
        toast.error(
          translate('auto.components.TaskPage.piLaunchError', 'Could not start Pi for this task.')
        )
      }
    },
    [createWorktree, repos, settings?.agentCmdOverrides]
  )

  const copyTask = useCallback((task: StatusMdTask) => {
    return window.api.ui.writeClipboardText(task.title)
  }, [])

  return { openStatusTask, workWithPi, copyTask }
}
