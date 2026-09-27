import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readHooksJson } from '../agent-hooks/hooks-json-read'
import { writeHooksJson, type HooksConfig } from '../agent-hooks/installer-utils'
import {
  applyManagedHooks,
  applyManagedStatusLine,
  getManagedCommand,
  getManagedLifecycleHook,
  getManagedScriptFileName,
  getManagedScriptPath,
  getStatusLineScriptFileName,
  getStatusLineScriptPath,
  getStatusLineSlotState
} from '../claude/hook-settings'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { linkAgentHomeResource } from './agent-home-resource-link'

export type ClaudeManagedHomeResourceOptions = {
  /** `CLAUDE_CONFIG_DIR` of the pinned account. */
  configDir: string
  /** The user's real Claude home; its skills and MCP registrations are the source. */
  systemConfigDir?: string
  systemClaudeJsonPath?: string
  hooksEnabled?: boolean
}

/**
 * Makes a managed Claude account home a complete `CLAUDE_CONFIG_DIR`.
 *
 * Claude reads hooks, MCP servers and skills from the active config dir, so a terminal pinned to a
 * managed account would otherwise lose the app's agent-status hooks, the `arca-megamind` MCP server
 * the ARCA installer registered with `claude mcp add -s user`, and `~/.claude/skills`. Everything
 * here is idempotent and one-way (real home → managed home); credentials are never mirrored, so two
 * accounts can never end up sharing a login.
 */
export function syncClaudeManagedHomeResources(options: ClaudeManagedHomeResourceOptions): void {
  const configDir = options.configDir
  const systemConfigDir = options.systemConfigDir ?? join(homedir(), '.claude')
  const systemClaudeJsonPath = options.systemClaudeJsonPath ?? join(homedir(), '.claude.json')
  mkdirSync(configDir, { recursive: true })
  syncManagedHooks(configDir, options.hooksEnabled !== false)
  mirrorUserMcpServers(systemClaudeJsonPath, join(configDir, '.claude.json'))
  linkAgentHomeResource(join(systemConfigDir, 'skills'), join(configDir, 'skills'))
  linkAgentHomeResource(join(systemConfigDir, 'commands'), join(configDir, 'commands'))
  linkAgentHomeResource(join(systemConfigDir, 'CLAUDE.md'), join(configDir, 'CLAUDE.md'))
}

function syncManagedHooks(configDir: string, hooksEnabled: boolean): void {
  if (!hooksEnabled) {
    return
  }
  const configPath = join(configDir, 'settings.json')
  const config = readHooksJson(configPath)
  if (!config) {
    // Unreadable or malformed settings: leave it alone rather than overwrite the user's file.
    return
  }
  const scriptPath = getManagedScriptPath()
  let next = applyManagedHooks(
    config,
    getManagedLifecycleHook(scriptPath),
    getManagedScriptFileName()
  )
  if (getStatusLineSlotState(next, getStatusLineScriptFileName()) === 'empty') {
    next = applyManagedStatusLine(
      next,
      getManagedCommand(getStatusLineScriptPath()),
      getStatusLineScriptFileName()
    )
  }
  if (JSON.stringify(next) !== JSON.stringify(config)) {
    writeHooksJson(configPath, next)
  }
}

/**
 * Copies only the `mcpServers` block of `~/.claude.json`, and only entries the managed home does
 * not define yet: the rest of that file is the user's project history and OAuth account.
 */
function mirrorUserMcpServers(systemClaudeJsonPath: string, managedClaudeJsonPath: string): void {
  const source = readJsonObject(systemClaudeJsonPath)
  const sourceServers = source?.mcpServers
  if (!isRecord(sourceServers) || Object.keys(sourceServers).length === 0) {
    return
  }
  const target = readJsonObject(managedClaudeJsonPath) ?? {}
  const targetServers = isRecord(target.mcpServers) ? { ...target.mcpServers } : {}
  let changed = false
  for (const [name, definition] of Object.entries(sourceServers)) {
    if (!(name in targetServers)) {
      targetServers[name] = definition
      changed = true
    }
  }
  if (!changed) {
    return
  }
  writeFileAtomically(
    managedClaudeJsonPath,
    `${JSON.stringify({ ...target, mcpServers: targetServers }, null, 2)}\n`
  )
}

function readJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/u, ''))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type { HooksConfig }
