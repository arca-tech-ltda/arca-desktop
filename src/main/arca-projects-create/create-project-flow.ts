import path from 'node:path'
import {
  ARCA_CREATION_STEPS,
  type ArcaCreationStep,
  type ArcaCreationStepId,
  type ArcaProjectCreationRequest,
  type ArcaProjectCreationResult
} from '../../shared/arca-project-creation'
import type { ArcaCatalogPullRequest, CatalogPullRequestInput } from './catalog-pull-request'
import type { ArcaRepositoryProvision } from './github-repo-provisioning'
import { arcaReadmeTemplate, arcaStatusTemplate } from './project-seed-files'

export type ArcaCreationDependencies = {
  home: string
  ensureRepository: (input: {
    name: string
    description: string
    addReadme: boolean
  }) => Promise<ArcaRepositoryProvision>
  cloneRepository: (input: { url: string; destination: string; name: string }) => Promise<void>
  writeSeedFiles: (destination: string, files: Record<string, string>) => Promise<void>
  commitAndPush: (destination: string, message: string) => Promise<void>
  publishLocalFolder: (input: {
    sourcePath: string
    url: string
    preferredRemoteName?: string
  }) => Promise<{ remoteName: string; branch: string; initialized: boolean }>
  moveFolder: (source: string, destination: string) => Promise<void>
  registerProject: (directory: string, previousPath?: string) => Promise<string | undefined>
  openCatalogPullRequest: (input: CatalogPullRequestInput) => Promise<ArcaCatalogPullRequest>
}

function createTracker(onProgress: (steps: ArcaCreationStep[]) => void): {
  steps: ArcaCreationStep[]
  run: <T>(id: ArcaCreationStepId, work: () => Promise<T>) => Promise<T>
  set: (id: ArcaCreationStepId, patch: Partial<ArcaCreationStep>) => void
} {
  const steps: ArcaCreationStep[] = ARCA_CREATION_STEPS.map((id) => ({ id, state: 'pending' }))
  const set = (id: ArcaCreationStepId, patch: Partial<ArcaCreationStep>): void => {
    const index = steps.findIndex((step) => step.id === id)
    steps[index] = { ...steps[index], ...patch }
    onProgress(steps.map((step) => ({ ...step })))
  }
  const run = async <T>(id: ArcaCreationStepId, work: () => Promise<T>): Promise<T> => {
    set(id, { state: 'running', detail: undefined })
    try {
      const value = await work()
      set(id, { state: 'done' })
      return value
    } catch (error) {
      set(id, { state: 'failed', detail: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
  return { steps, run, set }
}

function resumeHint(steps: ArcaCreationStep[], repoUrl?: string): string {
  const done = steps.filter((step) => step.state === 'done').map((step) => step.id)
  const failed = steps.find((step) => step.state === 'failed')
  return [
    done.length ? `Concluído: ${done.join(', ')}.` : 'Nada foi concluído.',
    failed ? `Falhou em: ${failed.id}.` : '',
    repoUrl
      ? `O repositório ${repoUrl} foi mantido; repita a ação com o mesmo nome para continuar.`
      : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export function arcaProjectDestination(
  home: string,
  type: string,
  name: string,
  windowsLike = process.platform === 'win32'
): string {
  const paths = windowsLike ? path.win32 : path.posix
  return paths.join(home, 'ARCA', type, name)
}

export async function runArcaProjectCreation(
  request: ArcaProjectCreationRequest,
  dependencies: ArcaCreationDependencies,
  onProgress: (steps: ArcaCreationStep[]) => void
): Promise<ArcaProjectCreationResult> {
  const tracker = createTracker(onProgress)
  const title = request.title?.trim() || request.name
  const destination = arcaProjectDestination(dependencies.home, request.type, request.name)
  let provision: ArcaRepositoryProvision | undefined
  let repoId: string | undefined
  let finalPath = request.sourcePath ?? destination
  let pullRequest: ArcaCatalogPullRequest | undefined
  try {
    provision = await tracker.run('createRepo', () =>
      dependencies.ensureRepository({
        name: request.name,
        description: request.description,
        addReadme: !request.sourcePath
      })
    )
    const repoUrl = provision.url
    await tracker.run('seedRepo', async () => {
      if (request.sourcePath) {
        const published = await dependencies.publishLocalFolder({
          sourcePath: request.sourcePath,
          url: repoUrl,
          ...(request.remoteName ? { preferredRemoteName: request.remoteName } : {})
        })
        tracker.set('seedRepo', { detail: `remote ${published.remoteName} → ${published.branch}` })
        if (request.moveToArcaRoot) {
          await dependencies.moveFolder(request.sourcePath, destination)
          finalPath = destination
        }
        return
      }
      await dependencies.cloneRepository({
        url: repoUrl,
        destination,
        name: request.name
      })
      await dependencies.writeSeedFiles(destination, {
        'README.md': arcaReadmeTemplate(title, request.description),
        'STATUS.md': arcaStatusTemplate(title, request.description)
      })
      await dependencies.commitAndPush(destination, 'Estrutura inicial (README e STATUS)')
    })
    repoId = await tracker.run('register', () =>
      dependencies.registerProject(
        finalPath,
        request.sourcePath && finalPath !== request.sourcePath ? request.sourcePath : undefined
      )
    )
    pullRequest = await tracker.run('catalogPr', () =>
      dependencies.openCatalogPullRequest({
        id: request.name,
        title,
        name: request.name,
        type: request.type,
        description: request.description
      })
    )
    tracker.set('catalogPr', {
      link: pullRequest.url,
      detail: pullRequest.merged ? undefined : pullRequest.mergeError
    })
    // The Mainframe exposes only `projects_list`; it imports projects.json itself once merged.
    tracker.set('mainframe', { state: 'skipped' })
    return {
      ok: true,
      steps: tracker.steps,
      repoUrl,
      ...(repoId ? { repoId } : {}),
      destination: finalPath,
      pullRequestUrl: pullRequest.url,
      merged: pullRequest.merged
    }
  } catch (error) {
    tracker.set('mainframe', { state: 'skipped' })
    return {
      ok: false,
      steps: tracker.steps,
      ...(provision ? { repoUrl: provision.url } : {}),
      ...(repoId ? { repoId } : {}),
      destination: finalPath,
      ...(pullRequest ? { pullRequestUrl: pullRequest.url, merged: pullRequest.merged } : {}),
      resume: resumeHint(tracker.steps, provision?.url),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
