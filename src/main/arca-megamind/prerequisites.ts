import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { isCommandOnPath } from '../ipc/preflight-command-exec'
import { getAgentAuthorityMode } from '../agent-authority/agent-authority-state'
import type { MegamindPrerequisites } from '../../shared/arca-megamind'

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

const readText = async (path: string): Promise<string> => readFile(path, 'utf8').catch(() => '')

/** Pi loads the extension either from its extensions dir or from a path listed in settings.json. */
async function piMegamindExtensionInstalled(agentDir: string): Promise<boolean> {
  if (await exists(join(agentDir, 'extensions', 'arca-megamind'))) {
    return true
  }
  let entries: unknown
  try {
    entries = JSON.parse(await readText(join(agentDir, 'settings.json'))).extensions
  } catch {
    return false
  }
  if (!Array.isArray(entries)) {
    return false
  }
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.startsWith('-') || basename(entry) !== 'arca-megamind') {
      continue
    }
    if (await exists(isAbsolute(entry) ? entry : join(agentDir, entry))) {
      return true
    }
  }
  return false
}

/** The workspace installer registers the MCP proxy in the user's Claude Code and Codex configs. */
async function managedMegamindMcpInstalled(home: string): Promise<boolean> {
  const [claude, codex] = await Promise.all([
    readText(join(home, '.claude.json')),
    readText(join(home, '.codex', 'config.toml'))
  ])
  return claude.includes('arca-megamind-mcp') || codex.includes('[mcp_servers.arca-megamind]')
}

export async function megamindPrerequisites(): Promise<MegamindPrerequisites> {
  const home = homedir()
  const windows = process.platform === 'win32'
  const mode = getAgentAuthorityMode()
  const agent =
    mode === 'pi'
      ? (await isCommandOnPath('pi')) &&
        (await piMegamindExtensionInstalled(join(home, '.pi', 'agent')))
      : await managedMegamindMcpInstalled(home)
  return {
    mode,
    agent,
    installer: await exists(join(home, 'ARCA', 'arca', windows ? 'install.ps1' : 'install.sh')),
    windows
  }
}
