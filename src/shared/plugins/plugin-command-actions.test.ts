import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from './plugin-manifest'
import {
  isPluginCommandAliasActionId,
  PLUGIN_COMMAND_ALIAS_ACTION_IDS
} from './plugin-command-actions'
import { isKeybindingActionId } from '../keybindings'

describe('retired workspace board plugin alias', () => {
  it('accepts the legacy manifest without dropping unrelated commands', () => {
    const commands = [
      { id: 'board', title: 'Board', action: 'workspace.openBoard' },
      { id: 'tasks', title: 'Tasks', action: 'view.tasks' }
    ]
    const result = parsePluginManifest({
      manifestVersion: 1,
      id: 'demo',
      publisher: 'orca-samples',
      name: 'Demo',
      version: '1.0.0',
      engines: { orca: '>=1.0.0' },
      pluginApi: 1,
      contributes: { commands },
      capabilities: []
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.manifest.contributes.commands).toEqual(commands)
    expect(isPluginCommandAliasActionId('workspace.openBoard')).toBe(true)
    expect(isPluginCommandAliasActionId('workspace.unknown')).toBe(false)
    expect(PLUGIN_COMMAND_ALIAS_ACTION_IDS).not.toContain('workspace.openBoard')
  })

  it('keeps the retired alias outside the command dispatcher registry', () => {
    expect(isKeybindingActionId('workspace.openBoard')).toBe(false)
    expect(isKeybindingActionId('view.tasks')).toBe(true)
  })
})
