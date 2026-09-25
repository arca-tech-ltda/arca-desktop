import { expect, it } from 'vitest'
import { piLaunchCommand } from './pi-launch-command'
import { recognizeAgentProcessFromCommandLine } from '../../shared/agent-process-recognition'

const env = { ORCA_PANE_KEY: 'pane', ORCA_PI_EXT_STATUS: 'C:\\Users\\Ana Silva\\status.ts' }
it.each([
  'bash',
  'zsh',
  'fish',
  'powershell.exe',
  'pwsh.exe',
  'C:\\Program Files\\Git\\bin\\bash.exe'
])('uses the existing Pi function on %s', (shell) => {
  expect(piLaunchCommand('pi --prompt hello', shell, env)).toBe('pi --prompt hello')
})
it('injects independent installed extensions for cmd without changing agent identity', () => {
  const command = piLaunchCommand('pi --prompt hello', 'cmd.exe', env)!
  expect(command).toBe('pi --extension "C:\\Users\\Ana Silva\\status.ts" --prompt hello')
  expect(recognizeAgentProcessFromCommandLine(command)?.agent).toBe('pi')
})
it('does not inject desktop paths when the execution host has no extensions', () => {
  expect(piLaunchCommand('pi', '/bin/sh', { ORCA_PANE_KEY: 'pane' })).toBe('pi')
})
it('injects extensions for absolute binaries that bypass shell functions', () => {
  expect(
    piLaunchCommand('/bin/pi', '/bin/bash', {
      ORCA_PANE_KEY: 'pane',
      ORCA_PI_EXT_STATUS: '/host/status.ts'
    })
  ).toBe("/bin/pi --extension '/host/status.ts'")
})
