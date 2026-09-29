import { BrowserWindow } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { Store } from '../persistence'
import { addLocalRepoFromPath } from '../ipc/repos/local-repo-registration'
import { notifyReposChanged } from '../ipc/repos/repos-changed-notification'
import { invalidateAuthorizedRootsCache } from '../ipc/registered-worktree-roots-cache'
import { gitExecFileAsync, nonInteractiveGitEnv } from '../git/runner'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { cloneArcaProject } from '../arca-projects-sync/clone'
import { normalizeArcaRemote } from '../arca-projects-sync/catalog'
import { ensureArcaRepository } from './github-repo-provisioning'
import { openArcaCatalogPullRequest } from './catalog-pull-request'
import { moveProjectFolder, publishLocalFolder } from './local-publish'
import type { ArcaCreationDependencies } from './create-project-flow'

const GIT_TIMEOUT_MS = 60_000
const PUSH_TIMEOUT_MS = 10 * 60_000

function notifyRepos(): void {
  invalidateAuthorizedRootsCache()
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (window) {
    notifyReposChanged(window)
  }
}

export function createArcaProjectCreationDependencies(
  store: Store,
  home = homedir()
): ArcaCreationDependencies {
  return {
    home,
    ensureRepository: ensureArcaRepository,
    cloneRepository: async ({ url, destination, name }) => {
      await cloneArcaProject({
        repoKey: normalizeArcaRemote(url) ?? url,
        name,
        url,
        destination,
        source: 'github'
      })
    },
    writeSeedFiles: async (destination, files) => {
      for (const [file, content] of Object.entries(files)) {
        await writeFile(path.join(destination, file), content, 'utf8')
      }
    },
    commitAndPush: async (destination, message) => {
      const git = async (args: string[], timeout = GIT_TIMEOUT_MS): Promise<void> => {
        await gitExecFileAsync(args, { cwd: destination, timeout, env: nonInteractiveGitEnv() })
      }
      await git(['add', '-A'])
      await git(['commit', '-m', message])
      await git(['push', '-u', 'origin', 'HEAD'], PUSH_TIMEOUT_MS)
    },
    publishLocalFolder,
    moveFolder: moveProjectFolder,
    registerProject: async (directory, previousPath) => {
      if (previousPath) {
        const key = normalizeRuntimePathForComparison(previousPath)
        const stale = store
          .getRepos()
          .find((repo) => normalizeRuntimePathForComparison(repo.path) === key)
        if (stale) {
          store.removeProject(stale.id)
        }
      }
      const registration = await addLocalRepoFromPath(store, directory)
      if ('error' in registration) {
        throw new Error(registration.error)
      }
      notifyRepos()
      return registration.repo.id
    },
    openCatalogPullRequest: (input) => openArcaCatalogPullRequest(input, home)
  }
}
