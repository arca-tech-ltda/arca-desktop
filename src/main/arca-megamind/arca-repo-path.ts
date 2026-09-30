import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where the `arca` workspace repository is cloned. Everything Megamind needs outside the app lives
 * there: the installer, the MCP proxy the agents speak through and the `arca-megamind` skill.
 */
export function resolveArcaRepoPath(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform
): string | null {
  const installer = platform === 'win32' ? 'install.ps1' : 'install.sh'
  for (const candidate of [process.env.ARCA_REPO_PATH, join(home, 'ARCA', 'arca')]) {
    if (candidate && existsSync(join(candidate, installer))) {
      return candidate
    }
  }
  return null
}

/** The stdio MCP server both Claude Code and Codex run to reach Megamind. */
export function arcaMegamindProxyPath(repoPath: string): string {
  return join(repoPath, 'bin', 'arca-megamind-mcp.mjs')
}

export function arcaMegamindSkillPath(repoPath: string): string {
  return join(repoPath, 'skills', 'arca-megamind')
}
