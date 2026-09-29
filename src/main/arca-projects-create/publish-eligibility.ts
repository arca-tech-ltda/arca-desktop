import { homedir } from 'node:os'
import path from 'node:path'
import {
  ARCA_ORG,
  isArcaProjectType,
  suggestArcaProjectSlug,
  type ArcaProjectType,
  type ArcaPublishEligibility
} from '../../shared/arca-project-creation'
import { normalizeArcaRemote } from '../arca-projects-sync/catalog'
import { isGitWorkingTree, listGitRemotes } from './local-publish'

export function arcaTypeFromPath(projectPath: string, home = homedir()): ArcaProjectType {
  const root = path.join(home, 'ARCA')
  const relative = path.relative(root, projectPath)
  const segment = relative.split(/[\\/]/)[0]
  return isArcaProjectType(segment) ? segment : 'clientes'
}

export function isArcaOrgRemote(remote: string): boolean {
  return normalizeArcaRemote(remote)?.startsWith(`github.com/${ARCA_ORG}/`) === true
}

/** Drives the "Publish to ARCA" menu entry: shown only for local projects outside the org. */
export async function arcaPublishEligibility(
  projectPath: string,
  home = homedir()
): Promise<ArcaPublishEligibility> {
  if (!projectPath) {
    return { eligible: false, reason: 'unknown_path' }
  }
  const isGitRepo = await isGitWorkingTree(projectPath)
  const remotes = isGitRepo ? await listGitRemotes(projectPath).catch(() => []) : []
  if (remotes.some((remote) => isArcaOrgRemote(remote.url))) {
    return { eligible: false, reason: 'already_arca' }
  }
  const origin = remotes.find((remote) => remote.name === 'origin')
  return {
    eligible: true,
    suggestedName: suggestArcaProjectSlug(path.basename(projectPath)),
    suggestedType: arcaTypeFromPath(projectPath, home),
    isGitRepo,
    ...(origin ? { originUrl: origin.url } : {})
  }
}
