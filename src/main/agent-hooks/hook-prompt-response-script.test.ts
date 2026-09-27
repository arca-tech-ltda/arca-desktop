import { afterEach, expect, it } from 'vitest'
import { getManagedScript as claudeScript } from '../claude/hook-script'
import { getManagedScript as codexScript } from '../codex/codex-hook-script'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!

afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
})

function onWindows<T>(build: () => T): T {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  return build()
}

it('prints the ARCA answer only on a prompt submission (POSIX)', () => {
  for (const script of [claudeScript('posix'), codexScript('posix')]) {
    expect(script).toContain('case "$payload" in *UserPromptSubmit*) max_time=4 ;; esac')
    expect(script).toContain(
      `if [ -n "\${orca_hook_response:-}" ]; then printf '%s\\n' "$orca_hook_response"; fi`
    )
  }
})

it('keeps the empty-JSON permission contract of the Claude hook ahead of everything', () => {
  expect(claudeScript('posix').split('\n').slice(0, 2)).toEqual(['#!/bin/sh', 'printf "{}\\n"'])
  expect(onWindows(() => claudeScript('local')).split('\r\n').slice(0, 3)).toEqual([
    '@echo off',
    'setlocal',
    'echo {}'
  ])
})

it('captures the answer into a temp file on Windows and removes it', () => {
  for (const script of [
    onWindows(() => claudeScript('local')),
    onWindows(() => codexScript('local'))
  ]) {
    expect(script).toContain('set "ORCA_HOOK_RESPONSE_FILE=%TEMP%\\orca-hook-%RANDOM%%RANDOM%.txt"')
    expect(script).toContain('-o "%ORCA_HOOK_RESPONSE_FILE%"')
    expect(script).toContain('--connect-timeout 0.5 --max-time 4')
    expect(script).toContain(
      'if exist "%ORCA_HOOK_RESPONSE_FILE%" type "%ORCA_HOOK_RESPONSE_FILE%" 2>nul'
    )
    expect(script).toContain(
      'if exist "%ORCA_HOOK_RESPONSE_FILE%" del /q "%ORCA_HOOK_RESPONSE_FILE%" 2>nul'
    )
  }
})
