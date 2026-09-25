import { useCallback } from 'react'
import { toast } from 'sonner'
import type { ArcaPriorityProject } from '../../../../shared/arca-priorities'
import { translate } from '@/i18n/i18n'
import { startPiOnStatusReference } from '@/lib/start-pi-on-status-reference'
import { useAppStore } from '@/store'

function prompt(project: ArcaPriorityProject): string {
  return [
    `Work on this priority from ${project.name}'s STATUS.md: ${project.title ?? ''}`,
    project.openTasks.length > 0
      ? `Open tasks:\n${project.openTasks.map((task) => `- ${task.text}`).join('\n')}`
      : null,
    project.line ? `Reference: STATUS.md line ${project.line}` : 'Reference: STATUS.md'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function usePriorityActions(): {
  openStatus: (project: ArcaPriorityProject) => void
  work: (project: ArcaPriorityProject) => Promise<void>
} {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const openFile = useAppStore((state) => state.openFile)
  const setEditorCursorLine = useAppStore((state) => state.setEditorCursorLine)
  const closeTaskPage = useAppStore((state) => state.closeTaskPage)
  const createWorktree = useAppStore((state) => state.createWorktree)
  const settings = useAppStore((state) => state.settings)

  const openStatus = useCallback(
    (project: ArcaPriorityProject): void => {
      if (!project.repoId || !project.path || !project.statusPath) {
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
      if (project.line) {
        setEditorCursorLine(fileId, project.line)
      }
      closeTaskPage()
    },
    [closeTaskPage, openFile, setEditorCursorLine, worktreesByRepo]
  )

  const work = useCallback(
    async (project: ArcaPriorityProject): Promise<void> => {
      const repo = repos.find((candidate) => candidate.id === project.repoId)
      if (!repo || !project.title) {
        return
      }
      const slug = project.title
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
      try {
        await startPiOnStatusReference({
          repoId: repo.id,
          branchName: `priority-${slug || project.line || 'task'}`,
          prompt: prompt(project),
          createWorktree,
          cmdOverrides: settings?.agentCmdOverrides
        })
      } catch {
        toast.error(
          translate(
            'auto.components.priorities.piLaunchError',
            'Could not start Pi for this priority.'
          )
        )
      }
    },
    [createWorktree, repos, settings?.agentCmdOverrides]
  )

  return { openStatus, work }
}
