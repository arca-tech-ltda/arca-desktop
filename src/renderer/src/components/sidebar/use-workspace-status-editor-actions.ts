import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'
import { getWorkspaceStatus } from './workspace-status'
import { makeWorkspaceStatusId } from '../../../../shared/workspace-statuses'

type WorkspaceStatuses = ReturnType<typeof useAppStore.getState>['workspaceStatuses']

export type WorkspaceStatusEditorActions = {
  workspaceStatuses: WorkspaceStatuses
  renameStatus: (statusId: string, label: string) => void
  changeStatusColor: (statusId: string, color: string) => void
  changeStatusIcon: (statusId: string, icon: string) => void
  moveStatus: (statusId: string, direction: -1 | 1) => void
  addStatus: () => void
  removeStatus: (statusId: string) => void
}

/** Create/rename/reorder/recolor the workspace statuses the sidebar groups by. */
export function useWorkspaceStatusEditorActions(): WorkspaceStatusEditorActions {
  const allWorktrees = useAllWorktrees()
  const workspaceStatuses = useAppStore((s) => s.workspaceStatuses)
  const setWorkspaceStatuses = useAppStore((s) => s.setWorkspaceStatuses)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)

  const renameStatus = useCallback(
    (statusId: string, label: string) => {
      const trimmed = label.trim()
      if (!trimmed) {
        return
      }
      setWorkspaceStatuses(
        workspaceStatuses.map((status) =>
          status.id === statusId ? { ...status, label: trimmed } : status
        )
      )
    },
    [setWorkspaceStatuses, workspaceStatuses]
  )

  const changeStatusColor = useCallback(
    (statusId: string, color: string) => {
      setWorkspaceStatuses(
        workspaceStatuses.map((status) => (status.id === statusId ? { ...status, color } : status))
      )
    },
    [setWorkspaceStatuses, workspaceStatuses]
  )

  const changeStatusIcon = useCallback(
    (statusId: string, icon: string) => {
      setWorkspaceStatuses(
        workspaceStatuses.map((status) => (status.id === statusId ? { ...status, icon } : status))
      )
    },
    [setWorkspaceStatuses, workspaceStatuses]
  )

  const moveStatus = useCallback(
    (statusId: string, direction: -1 | 1) => {
      const index = workspaceStatuses.findIndex((status) => status.id === statusId)
      const nextIndex = index + direction
      if (index === -1 || nextIndex < 0 || nextIndex >= workspaceStatuses.length) {
        return
      }
      const next = [...workspaceStatuses]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      setWorkspaceStatuses(next)
    },
    [setWorkspaceStatuses, workspaceStatuses]
  )

  const addStatus = useCallback(() => {
    const label = `Status ${workspaceStatuses.length + 1}`
    setWorkspaceStatuses([
      ...workspaceStatuses,
      { id: makeWorkspaceStatusId(label, workspaceStatuses), label }
    ])
  }, [setWorkspaceStatuses, workspaceStatuses])

  const removeStatus = useCallback(
    (statusId: string) => {
      if (workspaceStatuses.length <= 1) {
        return
      }
      const index = workspaceStatuses.findIndex((status) => status.id === statusId)
      if (index === -1) {
        return
      }
      const next = workspaceStatuses.filter((status) => status.id !== statusId)
      const fallbackStatus = next[Math.min(index, next.length - 1)]?.id ?? next[0]!.id
      setWorkspaceStatuses(next)
      // Why: workspaces still pointing at the removed status would otherwise
      // fall out of every sidebar status group.
      for (const worktree of allWorktrees) {
        if (getWorkspaceStatus(worktree, workspaceStatuses) === statusId) {
          void updateWorktreeMeta(
            worktree.id,
            { workspaceStatus: fallbackStatus },
            { executionHostId: worktree.hostId ?? 'local' }
          )
        }
      }
    },
    [allWorktrees, setWorkspaceStatuses, updateWorktreeMeta, workspaceStatuses]
  )

  return {
    workspaceStatuses,
    renameStatus,
    changeStatusColor,
    changeStatusIcon,
    moveStatus,
    addStatus,
    removeStatus
  }
}
