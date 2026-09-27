import { isWslUncPath } from './wsl-paths'

/**
 * Map key for a project path, shared by every project → account map (Pi bucket accounts and
 * Claude/Codex managed accounts). Windows paths are case- and separator-insensitive, so the same
 * project reached as `C:\Repo` and `c:/repo` must resolve to one entry.
 */
export function normalizeProjectPathKey(path: string, platform = process.platform): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  const separated = platform === 'win32' ? trimmed.replace(/\//gu, '\\') : trimmed
  const separator = platform === 'win32' ? '\\' : '/'
  const withoutTrailing =
    separated.length > 1 && separated.endsWith(separator) && !separated.endsWith(`:${separator}`)
      ? separated.replace(/[\\/]+$/u, '')
      : separated
  return platform === 'win32' ? withoutTrailing.toLowerCase() : withoutTrailing
}

/**
 * Per-project accounts only cover an agent started on this computer: on SSH and WSL the
 * credentials, the config home and the CLI all belong to the execution host.
 */
export function isLocalAccountSelectableProject(project: {
  connectionId?: string | null
  path?: string | null
}): boolean {
  return !project.connectionId?.trim() && !isWslUncPath(project.path ?? '')
}

/**
 * The selection for a terminal: the project entry when known, otherwise the longest mapped
 * path containing `cwd` (a worktree checked out inside the project).
 */
export function resolveProjectSelectionForLaunch<Selection>(
  projects: Record<string, Selection>,
  paths: { projectPath?: string | null; cwd?: string | null },
  platform = process.platform
): Selection | null {
  const directKey = normalizeProjectPathKey(paths.projectPath ?? '', platform)
  const direct = directKey ? projects[directKey] : undefined
  if (direct) {
    return direct
  }
  const cwdKey = normalizeProjectPathKey(paths.cwd ?? '', platform)
  if (!cwdKey) {
    return null
  }
  const separator = platform === 'win32' ? '\\' : '/'
  let best = ''
  for (const key of Object.keys(projects)) {
    if (
      key !== cwdKey &&
      !cwdKey.startsWith(key.endsWith(separator) ? key : `${key}${separator}`)
    ) {
      continue
    }
    if (key.length > best.length) {
      best = key
    }
  }
  return best ? (projects[best] ?? null) : null
}
