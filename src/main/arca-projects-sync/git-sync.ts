import { runWithGitWorktreeOperationLock } from '../../shared/git-worktree-operation-lock'
import { runWithGitReadCacheInvalidation } from '../git/source-control/git-read-cache-invalidation'
import { gitExecFileAsync, nonInteractiveGitEnv } from '../git/runner'
import type { ArcaSyncRow } from '../../shared/arca-projects-sync'

export function shouldFastForward(input: {
  clean: boolean
  defaultBranch: boolean
  ahead: number
  behind: number
  autoUpdate: boolean
}): boolean {
  return (
    input.autoUpdate && input.clean && input.defaultBranch && input.ahead === 0 && input.behind > 0
  )
}

export async function syncArcaGit(
  cwd: string,
  autoUpdate: () => boolean
): Promise<Pick<ArcaSyncRow, 'state' | 'ahead' | 'behind'>> {
  return runWithGitWorktreeOperationLock(cwd, undefined, () =>
    runWithGitReadCacheInvalidation(() => syncLocked(cwd, autoUpdate))
  )
}

async function syncLocked(
  cwd: string,
  autoUpdate: () => boolean
): Promise<Pick<ArcaSyncRow, 'state' | 'ahead' | 'behind'>> {
  const git = async (...args: string[]): Promise<string> =>
    (
      await gitExecFileAsync(args, { cwd, timeout: 60_000, env: nonInteractiveGitEnv() })
    ).stdout.trim()
  await git('fetch', '--prune', 'origin')
  const remoteHead = await git('ls-remote', '--symref', 'origin', 'HEAD')
  const defaultRef = remoteHead.match(/^ref: refs\/heads\/(.+)\s+HEAD$/m)?.[1]
  if (!defaultRef) {
    throw new Error('Cannot determine origin default branch')
  }
  const branch = await git('branch', '--show-current')
  const clean =
    (await git('status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'))
      .length === 0
  const target = `refs/remotes/origin/${defaultRef}`
  const [ahead, behind] = (await git('rev-list', '--left-right', '--count', `HEAD...${target}`))
    .split(/\s+/)
    .map(Number)
  if (!clean) {
    return { state: 'dirty', ahead, behind }
  }
  if (branch !== defaultRef) {
    return { state: 'branch', ahead, behind }
  }
  if (shouldFastForward({ clean, defaultBranch: true, ahead, behind, autoUpdate: autoUpdate() })) {
    // Recheck after network work; never switch branches or hide local changes.
    if ((await git('branch', '--show-current')) !== branch) {
      return { state: 'branch', ahead, behind }
    }
    if (await git('status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none')) {
      return { state: 'dirty', ahead, behind }
    }
    if (!autoUpdate()) {
      return { state: 'behind', ahead, behind }
    }
    await git('merge', '--ff-only', '--no-edit', target)
    return { state: 'updated', ahead: 0, behind: 0 }
  }
  return { state: behind > 0 ? 'behind' : ahead > 0 ? 'ahead' : 'updated', ahead, behind }
}
