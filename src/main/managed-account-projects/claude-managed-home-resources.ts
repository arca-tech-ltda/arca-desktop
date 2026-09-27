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
  syncManagedSettings(configDir, systemConfigDir, options.hooksEnabled !== false)
  mirrorUserClaudeJson(systemClaudeJsonPath, join(configDir, '.claude.json'))
  linkAgentHomeResource(join(systemConfigDir, 'skills'), join(configDir, 'skills'))
  linkAgentHomeResource(join(systemConfigDir, 'commands'), join(configDir, 'commands'))
  linkAgentHomeResource(join(systemConfigDir, 'CLAUDE.md'), join(configDir, 'CLAUDE.md'))
}

/**
 * Account-level preferences of `~/.claude/settings.json` worth inheriting. `hooks` and `statusLine`
 * are deliberately absent: those are the app's, applied below.
 */
const INHERITED_SETTINGS_KEYS = ['permissions', 'model', 'env'] as const

function syncManagedSettings(
  configDir: string,
  systemConfigDir: string,
  hooksEnabled: boolean
): void {
  const configPath = join(configDir, 'settings.json')
  const config = readHooksJson(configPath)
  if (!config) {
    // Unreadable or malformed settings: leave it alone rather than overwrite the user's file.
    return
  }
  let next = config
  const source = readJsonObject(join(systemConfigDir, 'settings.json'))
  for (const key of INHERITED_SETTINGS_KEYS) {
    // Never an overwrite: what the account already decided outranks the real home.
    if (source?.[key] !== undefined && next[key] === undefined) {
      next = { ...next, [key]: source[key] }
    }
  }
  if (hooksEnabled) {
    next = applyManagedHooks(
      next,
      getManagedLifecycleHook(getManagedScriptPath()),
      getManagedScriptFileName()
    )
    if (getStatusLineSlotState(next, getStatusLineScriptFileName()) === 'empty') {
      next = applyManagedStatusLine(
        next,
        getManagedCommand(getStatusLineScriptPath()),
        getStatusLineScriptFileName()
      )
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(config)) {
    writeHooksJson(configPath, next)
  }
}

/** Per-project flags that only spare a re-ask; nothing here identifies or authenticates anyone. */
const MIRRORED_PROJECT_KEYS = ['hasTrustDialogAccepted', 'allowedTools'] as const

/**
 * Copies from `~/.claude.json` only what a fresh config dir would otherwise ask for again: the
 * `mcpServers` block, the onboarding flag and, per project, the trust answer and its allowed
 * tools. Everything else — above all `oauthAccount` and any token — stays in the real home, and an
 * entry the managed home already defines is never overwritten.
 */
function mirrorUserClaudeJson(systemClaudeJsonPath: string, managedClaudeJsonPath: string): void {
  const source = readJsonObject(systemClaudeJsonPath)
  if (!source) {
    return
  }
  const target = readJsonObject(managedClaudeJsonPath) ?? {}
  const next = { ...target }
  let changed = mergeMissingEntries(source.mcpServers, next, 'mcpServers')
  if (source.hasCompletedOnboarding === true && next.hasCompletedOnboarding === undefined) {
    next.hasCompletedOnboarding = true
    changed = true
  }
  changed = mirrorProjectTrust(source.projects, next) || changed
  if (!changed) {
    return
  }
  writeFileAtomically(managedClaudeJsonPath, `${JSON.stringify(next, null, 2)}\n`)
}

function mergeMissingEntries(
  sourceBlock: unknown,
  target: Record<string, unknown>,
  key: string
): boolean {
  if (!isRecord(sourceBlock)) {
    return false
  }
  const merged = isRecord(target[key]) ? { ...target[key] } : {}
  let changed = false
  for (const [name, definition] of Object.entries(sourceBlock)) {
    if (!(name in merged)) {
      merged[name] = definition
      changed = true
    }
  }
  if (changed) {
    target[key] = merged
  }
  return changed
}

function mirrorProjectTrust(sourceProjects: unknown, target: Record<string, unknown>): boolean {
  if (!isRecord(sourceProjects)) {
    return false
  }
  const projects = isRecord(target.projects) ? { ...target.projects } : {}
  let changed = false
  for (const [path, entry] of Object.entries(sourceProjects)) {
    if (!isRecord(entry)) {
      continue
    }
    const existing = isRecord(projects[path]) ? { ...projects[path] } : {}
    for (const key of MIRRORED_PROJECT_KEYS) {
      if (entry[key] !== undefined && existing[key] === undefined) {
        existing[key] = entry[key]
        changed = true
      }
    }
    if (Object.keys(existing).length) {
      projects[path] = existing
    }
  }
  if (changed) {
    target.projects = projects
  }
  return changed
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
