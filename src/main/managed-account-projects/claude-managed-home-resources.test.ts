import { afterEach, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncClaudeManagedHomeResources } from './claude-managed-home-resources'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function homes(): { configDir: string; systemConfigDir: string; systemClaudeJsonPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'claude-managed-home-'))
  dirs.push(root)
  const systemConfigDir = join(root, 'home', '.claude')
  mkdirSync(join(systemConfigDir, 'skills', 'arca-megamind'), { recursive: true })
  writeFileSync(join(systemConfigDir, 'skills', 'arca-megamind', 'SKILL.md'), '# skill\n')
  const systemClaudeJsonPath = join(root, 'home', '.claude.json')
  writeFileSync(
    systemClaudeJsonPath,
    JSON.stringify({
      mcpServers: { 'arca-megamind': { command: 'arca-megamind-mcp' } },
      oauthAccount: { emailAddress: 'someone@arca.com' },
      projects: { '/secret': {} }
    })
  )
  return { configDir: join(root, 'managed', 'auth'), systemConfigDir, systemClaudeJsonPath }
}

it('registers the app hooks, the user MCP servers and the skills in a managed home', () => {
  const paths = homes()
  syncClaudeManagedHomeResources(paths)

  const settings: { hooks?: Record<string, unknown[]> } = JSON.parse(
    readFileSync(join(paths.configDir, 'settings.json'), 'utf-8')
  )
  expect(Object.keys(settings.hooks ?? {})).toContain('SessionStart')
  const claudeJson: { mcpServers?: Record<string, unknown>; projects?: unknown } = JSON.parse(
    readFileSync(join(paths.configDir, '.claude.json'), 'utf-8')
  )
  expect(claudeJson.mcpServers).toHaveProperty('arca-megamind')
  // Only the MCP block crosses over: project history and the OAuth account stay in the real home.
  expect(claudeJson.projects).toBeUndefined()
  expect(readFileSync(join(paths.configDir, 'skills', 'arca-megamind', 'SKILL.md'), 'utf-8')).toBe(
    '# skill\n'
  )
})

it('is idempotent and never overwrites what the managed home already has', () => {
  const paths = homes()
  syncClaudeManagedHomeResources(paths)
  const firstSettings = readFileSync(join(paths.configDir, 'settings.json'), 'utf-8')
  writeFileSync(
    join(paths.configDir, '.claude.json'),
    JSON.stringify({ mcpServers: { 'arca-megamind': { command: 'edited-by-user' } } })
  )

  syncClaudeManagedHomeResources(paths)

  expect(readFileSync(join(paths.configDir, 'settings.json'), 'utf-8')).toBe(firstSettings)
  const claudeJson: { mcpServers: Record<string, { command: string }> } = JSON.parse(
    readFileSync(join(paths.configDir, '.claude.json'), 'utf-8')
  )
  expect(claudeJson.mcpServers['arca-megamind']?.command).toBe('edited-by-user')
})

it('never copies credentials between homes', () => {
  const paths = homes()
  writeFileSync(join(paths.systemConfigDir, '.credentials.json'), '{"token":"real-home"}')
  syncClaudeManagedHomeResources(paths)
  expect(() => readFileSync(join(paths.configDir, '.credentials.json'), 'utf-8')).toThrowError()
})

it('skips the hook registration when agent status hooks are off', () => {
  const paths = homes()
  syncClaudeManagedHomeResources({ ...paths, hooksEnabled: false })
  expect(() => readFileSync(join(paths.configDir, 'settings.json'), 'utf-8')).toThrowError()
})

it('links the skills directory rather than copying it where the platform allows', () => {
  const paths = homes()
  syncClaudeManagedHomeResources(paths)
  if (process.platform !== 'win32') {
    expect(readlinkSync(join(paths.configDir, 'skills'))).toBe(join(paths.systemConfigDir, 'skills'))
  }
})
