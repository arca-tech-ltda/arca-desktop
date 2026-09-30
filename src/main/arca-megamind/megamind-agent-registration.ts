import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { writeFileAtomicallyIfUnchanged } from '../codex-accounts/fs-utils'
import { linkAgentHomeResource } from '../managed-account-projects/agent-home-resource-link'
import { arcaMegamindProxyPath, arcaMegamindSkillPath, resolveArcaRepoPath } from './arca-repo-path'

const SERVER_NAME = 'arca-megamind'
const CODEX_SECTION = `[mcp_servers.${SERVER_NAME}]`

/**
 * Gives Claude Code and Codex the Megamind MCP proxy and skill, the same registrations
 * `arca/install.sh` writes — a partner must not have to run an installer by hand to be reachable.
 *
 * Only the user's real homes are written: the per-project managed homes take `mcpServers` and
 * `skills` from there (`syncClaudeManagedHomeResources`, `syncSystemCodexResourcesIntoManagedHome`),
 * so one registration reaches every `CLAUDE_CONFIG_DIR` / `CODEX_HOME` the app pins. Idempotent:
 * an entry that exists is never rewritten, and an unreadable config is left alone.
 *
 * Callers gate this on the `managed` authority; in `pi` mode the Pi extension is the link.
 */
export function ensureMegamindAgentRegistrations(home: string = homedir()): boolean {
  const repoPath = resolveArcaRepoPath(home)
  const proxyPath = repoPath ? arcaMegamindProxyPath(repoPath) : null
  if (!repoPath || !proxyPath || !existsSync(proxyPath)) {
    return false
  }
  registerClaudeMcpServer(join(home, '.claude.json'), proxyPath)
  registerCodexMcpServer(join(home, '.codex', 'config.toml'), proxyPath)
  const skillPath = arcaMegamindSkillPath(repoPath)
  for (const skillsDir of [join(home, '.claude', 'skills'), join(home, '.codex', 'skills')]) {
    mkdirSync(skillsDir, { recursive: true })
    linkAgentHomeResource(skillPath, join(skillsDir, SERVER_NAME))
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

function registerClaudeMcpServer(configPath: string, proxyPath: string): void {
  const current = existsSync(configPath) ? readTextOrNull(configPath) : ''
  if (current === null) {
    return
  }
  let config: Record<string, unknown> = {}
  if (current.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(current.replace(/^\uFEFF/u, ''))
    } catch {
      // A config Claude is mid-write on, or one we do not understand, is never replaced.
      return
    }
    if (!isRecord(parsed)) {
      return
    }
    config = parsed
  }
  const servers = isRecord(config.mcpServers) ? config.mcpServers : {}
  if (SERVER_NAME in servers) {
    return
  }
  const next = {
    ...config,
    mcpServers: {
      ...servers,
      [SERVER_NAME]: {
        type: 'stdio',
        command: 'node',
        args: [proxyPath, '--harness', 'claude-code'],
        env: {}
      }
    }
  }
  writeFileAtomicallyIfUnchanged(
    configPath,
    current === '' ? null : current,
    `${JSON.stringify(next, null, 2)}\n`
  )
}

function registerCodexMcpServer(configPath: string, proxyPath: string): void {
  const current = existsSync(configPath) ? readTextOrNull(configPath) : ''
  if (current === null || current.includes(CODEX_SECTION)) {
    return
  }
  const block = `${CODEX_SECTION}\ncommand = "node"\nargs = [${JSON.stringify(proxyPath)}, "--harness", "codex"]\n`
  mkdirSync(dirname(configPath), { recursive: true })
  // A new table header always closes the previous one, so appending cannot land inside it.
  const next = current.trim() ? `${current.replace(/\n*$/u, '\n')}\n${block}` : block
  writeFileAtomicallyIfUnchanged(configPath, current === '' ? null : current, next)
}
