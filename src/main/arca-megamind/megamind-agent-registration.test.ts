import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncClaudeManagedHomeResources } from '../managed-account-projects/claude-managed-home-resources'
import { ensureMegamindAgentRegistrations } from './megamind-agent-registration'

let home = ''

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function seedRepo(): string {
  const repo = join(home, 'ARCA', 'arca')
  write(join(repo, 'install.sh'), '#!/bin/bash\n')
  write(join(repo, 'bin', 'arca-megamind-mcp.mjs'), '// proxy\n')
  mkdirSync(join(repo, 'skills', 'arca-megamind'), { recursive: true })
  return repo
}

const claudeJson = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(home, '.claude.json'), 'utf-8'))

describe('ensureMegamindAgentRegistrations', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'megamind-registration-'))
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('registers the MCP proxy and the skill for Claude Code and Codex', () => {
    const repo = seedRepo()
    expect(ensureMegamindAgentRegistrations(home)).toBe(true)

    expect(claudeJson().mcpServers).toEqual({
      'arca-megamind': {
        type: 'stdio',
        command: 'node',
        args: [join(repo, 'bin', 'arca-megamind-mcp.mjs'), '--harness', 'claude-code'],
        env: {}
      }
    })
    const codex = readFileSync(join(home, '.codex', 'config.toml'), 'utf-8')
    expect(codex).toContain('[mcp_servers.arca-megamind]')
    expect(codex).toContain(JSON.stringify(join(repo, 'bin', 'arca-megamind-mcp.mjs')))
    for (const agentDir of ['.claude', '.codex']) {
      expect(lstatSync(join(home, agentDir, 'skills', 'arca-megamind')).isSymbolicLink()).toBe(true)
    }
  })

  it('keeps what the user already has and never registers twice', () => {
    seedRepo()
    write(
      join(home, '.claude.json'),
      `${JSON.stringify({ mcpServers: { other: { command: 'x' } }, oauthAccount: { id: 'a' } }, null, 2)}\n`
    )
    write(join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n')
    ensureMegamindAgentRegistrations(home)
    const afterFirst = readFileSync(join(home, '.codex', 'config.toml'), 'utf-8')
    ensureMegamindAgentRegistrations(home)

    expect(claudeJson()).toMatchObject({ oauthAccount: { id: 'a' } })
    expect(Object.keys(claudeJson().mcpServers ?? {})).toEqual(['other', 'arca-megamind'])
    expect(readFileSync(join(home, '.codex', 'config.toml'), 'utf-8')).toBe(afterFirst)
    expect(afterFirst.startsWith('model = "gpt-5"\n')).toBe(true)
    expect(afterFirst.match(/\[mcp_servers\.arca-megamind\]/gu)).toHaveLength(1)
  })

  it('reaches a per-project managed Claude home through the existing mirror', () => {
    seedRepo()
    ensureMegamindAgentRegistrations(home)
    const configDir = join(home, 'managed', 'auth')
    syncClaudeManagedHomeResources({
      configDir,
      systemConfigDir: join(home, '.claude'),
      systemClaudeJsonPath: join(home, '.claude.json')
    })

    const mirrored: { mcpServers?: Record<string, unknown> } = JSON.parse(
      readFileSync(join(configDir, '.claude.json'), 'utf-8')
    )
    expect(mirrored.mcpServers).toHaveProperty('arca-megamind')
    expect(lstatSync(join(configDir, 'skills', 'arca-megamind')).isSymbolicLink()).toBe(true)
  })

  it('does nothing without the arca repo, and never replaces a config it cannot read', () => {
    expect(ensureMegamindAgentRegistrations(home)).toBe(false)
    seedRepo()
    write(join(home, '.claude.json'), '{ this is not json')
    ensureMegamindAgentRegistrations(home)
    expect(readFileSync(join(home, '.claude.json'), 'utf-8')).toBe('{ this is not json')
  })
})
