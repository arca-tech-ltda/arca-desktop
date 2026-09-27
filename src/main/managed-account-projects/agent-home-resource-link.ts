import { cpSync, existsSync, lstatSync, symlinkSync } from 'node:fs'

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

function observeLink(targetPath: string): { exists: boolean } {
  try {
    lstatSync(targetPath)
    return { exists: true }
  } catch {
    return { exists: false }
  }
}
