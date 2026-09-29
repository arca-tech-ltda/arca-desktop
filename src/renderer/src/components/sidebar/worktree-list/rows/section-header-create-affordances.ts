import type { FolderWorkspacePathStatus } from '../../../../../../shared/folder-workspace-path-status'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import {
  getRepoHeaderCreateState,
  type RepoHeaderCreateState
} from '../../repo-header-create-state'
import type { GroupHeaderRow } from '../grouping/row-types'
import type { SectionHeaderRowContext } from './SectionHeader'

/** Whether this header can offer "new workspace", and the folder path it depends on. */
export function resolveSectionHeaderCreateAffordances(args: {
  ctx: Pick<SectionHeaderRowContext, 'sshConnectionStates' | 'getCachedFolderWorkspacePathStatus'>
  row: GroupHeaderRow
  isProjectGroupHeader: boolean
}): {
  createState: RepoHeaderCreateState | null
  folderBackedProjectGroup: ProjectGroup | null
  projectGroupPathStatus: FolderWorkspacePathStatus | null
} {
  const { ctx, row } = args
  const createState = row.repo
    ? getRepoHeaderCreateState({
        repo: row.repo,
        label: row.label,
        sshStatus: row.repo.connectionId
          ? (ctx.sshConnectionStates.get(row.repo.connectionId)?.status ?? null)
          : null
      })
    : null
  const folderBackedProjectGroup =
    args.isProjectGroupHeader &&
    !row.repo &&
    row.projectGroup &&
    'parentPath' in row.projectGroup &&
    row.projectGroup.parentPath
      ? row.projectGroup
      : null
  return {
    createState,
    folderBackedProjectGroup,
    projectGroupPathStatus: folderBackedProjectGroup
      ? ctx.getCachedFolderWorkspacePathStatus({
          scope: 'project-group',
          projectGroupId: folderBackedProjectGroup.id
        })
      : null
  }
}
