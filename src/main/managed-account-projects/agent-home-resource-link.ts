import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'

/**
 * Points a managed agent home at a resource of the user's real home (skills, prompts…).
 *
 * Idempotent and non-destructive: an entry that already exists is left alone, so a copy the user
 * edited or a link a dotfile manager owns is never replaced. Symlink first, copy where Windows
 * refuses it outside developer mode.
 */
export function linkAgentHomeResource(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath)) {
    return
  }
  const existing = observeLink(targetPath)
  if (existing.exists) {
    return
  }
  try {
    const sourceStat = lstatSync(sourcePath)
    symlinkSync(
      sourcePath,
      targetPath,
      sourceStat.isDirectory() && process.platform === 'win32' ? 'junction' : undefined
    )
  } catch {
    try {
      cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true })
    } catch (error) {
      console.warn('[managed-account-projects] could not mirror', sourcePath, error)
    }
  }
}

/** Nesting a managed home ever reaches: `<home>/skills/<name>`. */
const LINK_SCAN_DEPTH = 3

/**
 * Drops every link inside a managed home before the home itself is deleted.
 *
 * The home's `skills`, `commands`, `prompts`… are links (junctions on Windows) into the user's real
 * `~/.claude` / `~/.codex`. A recursive delete that follows one of those would take the user's own
 * files with the account, so the links are severed first — the link itself, never its target.
 */
export function unlinkAgentHomeResourceLinks(homePath: string, depth = LINK_SCAN_DEPTH): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(homePath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const entryPath = join(homePath, entry.name)
    if (entry.isSymbolicLink()) {
      removeLinkItself(entryPath)
      continue
    }
    if (entry.isDirectory() && depth > 1) {
      unlinkAgentHomeResourceLinks(entryPath, depth - 1)
    }
  }
}

function removeLinkItself(entryPath: string): void {
  try {
    unlinkSync(entryPath)
  } catch {
    try {
      // Windows: a directory symlink or junction is removed with rmdir, which never follows it.
      rmdirSync(entryPath)
    } catch (error) {
      console.warn('[managed-account-projects] could not unlink', entryPath, error)
    }
  }
}

function observeLink(targetPath: string): { exists: boolean } {
  try {
    lstatSync(targetPath)
    return { exists: true }
  } catch {
    return { exists: false }
  }
}
