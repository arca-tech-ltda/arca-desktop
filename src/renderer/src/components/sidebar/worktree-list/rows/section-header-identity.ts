import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { GroupHeaderRow, WorktreeGroupBy } from '../grouping/row-types'
import type { WorktreeSidebarHeaderDrag } from '../drag/use-header-drag'

export type SectionHeaderIdentity = {
  isRepoHeader: boolean
  isProjectGroupHeader: boolean
  projectIdForHeader: string | undefined
  projectGroupIdForHeader: string | undefined
  projectGroupHostIdForHeader: ExecutionHostId | undefined
  repoHeaderIndex: number | undefined
  repoHeaderBucketKey: string | undefined
  projectGroupHeaderIndex: number | undefined
  projectGroupHeaderBucketKey: string | undefined
  isDraggableRepoHeader: boolean
  isDraggableProjectGroupHeader: boolean
  isDraggingThis: boolean
  isDraggingThisProjectGroup: boolean
}

/** Which tier a section header belongs to, and whether reordering it is armed. */
export function resolveSectionHeaderIdentity(args: {
  groupBy: WorktreeGroupBy
  row: GroupHeaderRow
  headerDrag: WorktreeSidebarHeaderDrag
}): SectionHeaderIdentity {
  const { groupBy, row, headerDrag } = args
  const isRepoHeader = groupBy === 'repo' && row.repo !== undefined
  const isProjectGroupHeader = groupBy === 'repo' && row.projectGroup !== undefined
  const projectIdForHeader = isRepoHeader ? row.repo?.id : undefined
  const projectGroupIdForHeader =
    isProjectGroupHeader && !row.repo && typeof row.projectGroup?.id === 'string'
      ? row.projectGroup.id
      : undefined
  const repoHeaderBucketKey =
    projectIdForHeader !== undefined
      ? headerDrag.repoHeaderBucketByRepoId.get(projectIdForHeader)
      : undefined
  const projectGroupHeaderBucketKey =
    projectGroupIdForHeader !== undefined
      ? headerDrag.projectGroupHeaderBucketByGroupId.get(projectGroupIdForHeader)
      : undefined
  return {
    isRepoHeader,
    isProjectGroupHeader,
    projectIdForHeader,
    projectGroupIdForHeader,
    // Why: rename/delete must route to the host that owns this row, not to whichever host has focus.
    projectGroupHostIdForHeader:
      row.projectGroup && 'createdFrom' in row.projectGroup
        ? getProjectGroupHostId(row.projectGroup)
        : undefined,
    repoHeaderIndex:
      projectIdForHeader !== undefined
        ? headerDrag.repoHeaderIndexByRepoId.get(projectIdForHeader)
        : undefined,
    repoHeaderBucketKey,
    projectGroupHeaderIndex:
      projectGroupIdForHeader !== undefined
        ? headerDrag.projectGroupHeaderIndexByGroupId.get(projectGroupIdForHeader)
        : undefined,
    projectGroupHeaderBucketKey,
    isDraggableRepoHeader: Boolean(
      headerDrag.canReorderRepoHeaders &&
      isRepoHeader &&
      projectIdForHeader &&
      repoHeaderBucketKey &&
      (headerDrag.sidebarRepoHeaderIdsByBucket.get(repoHeaderBucketKey)?.length ?? 0) > 1
    ),
    isDraggableProjectGroupHeader: Boolean(
      headerDrag.canReorderProjectGroupHeaders &&
      projectGroupIdForHeader &&
      projectGroupHeaderBucketKey &&
      (headerDrag.sidebarProjectGroupHeaderIdsByBucket.get(projectGroupHeaderBucketKey)?.length ??
        0) > 1
    ),
    isDraggingThis:
      headerDrag.canReorderRepoHeaders &&
      headerDrag.repoDrag.state.draggingRepoId !== null &&
      headerDrag.repoDrag.state.draggingRepoId === projectIdForHeader,
    isDraggingThisProjectGroup:
      headerDrag.canReorderProjectGroupHeaders &&
      headerDrag.projectGroupDrag.state.draggingGroupId !== null &&
      headerDrag.projectGroupDrag.state.draggingGroupId === projectGroupIdForHeader
  }
}
