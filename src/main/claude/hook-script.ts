/** The managed Claude-compatible hook script, built for local, POSIX-remote and Windows targets.
 *  Split from hook-service.ts so the service owns install/status and this owns script text,
 *  mirroring the same split under src/main/cursor/. */
import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/installer-utils'
import {
  buildPosixHookResponseEmitLines,
  buildPosixHookResponseMaxTimeLine,
  buildWindowsHookPromptBudgetLines,
  buildWindowsHookResponseLines
} from '../agent-hooks/hook-prompt-response-script'
import { buildPosixAgentHookPostCommand } from '../agent-hooks/hook-post-command'
import {
  buildPosixGrokReplayGuardLines,
  buildWindowsGrokReplayGuardLines
} from '../agent-hooks/grok-replay-guard'
import {
  WINDOWS_HOOK_STDIN_DRAIN_LABEL,
  buildPosixHookPayloadCapture,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'

export function getManagedScript(
  target: 'local' | 'posix' = 'local',
  options: {
    skipWhenDevinImportsClaude?: boolean
    skipWhenGrokImportsClaude?: boolean
  } = {}
): string {
  const windowsResponse = buildWindowsHookResponseLines('ORCA_HOOK_RESPONSE_FILE')
  const windowsBudget = buildWindowsHookPromptBudgetLines({
    payloadVariable: 'ORCA_HOOK_PAYLOAD_FILE',
    maxTimeVariable: 'ORCA_HOOK_MAX_TIME'
  })
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: Claude-compatible permission hooks fail closed on empty stdout (#14818).
      'echo {}',
      // Why: refresh endpoint coordinates for PTYs surviving an ARCA restart.
      'if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul',
      // Why (#11549): the env guards must outrank the Devin skip — the Devin skip parks in more.com,
      // and outside an ARCA pane the caller can abandon stdin, so more.com never returns.
      ...buildWindowsHookEnvironmentGuardLines(),
      // Why: a backgrounded session runs in a daemon worker that inherited the dispatching
      // pane's env, so ORCA_PANE_KEY names a pane this session does not run in (#9236).
      // Why exit, not the drain label: the drain parks in more.com and a worker is outside
      // an ARCA pane — the abandoned-stdin hang #11549 guards against.
      'if not "%CLAUDE_JOB_DIR%"=="" exit /b 0',
      ...(options.skipWhenGrokImportsClaude ? buildWindowsGrokReplayGuardLines() : []),
      ...(options.skipWhenDevinImportsClaude
        ? [
            // Why: Devin imports .claude hooks by default; skip ARCA's managed hook there so status posts stay attributed to Devin.
            `if not "%DEVIN_PROJECT_DIR%"=="" goto :${WINDOWS_HOOK_STDIN_DRAIN_LABEL}`
          ]
        : []),
      // Why: use curl.exe to avoid an extra PowerShell startup per hook.
      ...windowsBudget.capture,
      windowsResponse.declare,
      buildWindowsAgentHookCurlPostCommand('claude', {
        responseFile: windowsResponse.reference,
        maxTimeReference: windowsBudget.maxTimeReference,
        payloadFile: windowsBudget.payloadReference
      }),
      ...windowsBudget.cleanup,
      // Why: ARCA answers a prompt submission with inbox context; Claude appends this stdout to the turn.
      ...windowsResponse.emit,
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    // Why: Claude-compatible permission hooks fail closed on empty stdout (#14818).
    'printf "{}\\n"',
    ...buildPosixHookPayloadCapture(),
    ...(options.skipWhenGrokImportsClaude ? buildPosixGrokReplayGuardLines() : []),
    ...buildPosixHookSpoolLines('claude'),
    ...(options.skipWhenDevinImportsClaude
      ? [
          // Why: Devin imports .claude hooks by default; skip ARCA's managed hook there so status posts stay attributed to Devin.
          'if [ -n "$DEVIN_PROJECT_DIR" ]; then',
          '  exit 0',
          'fi'
        ]
      : []),
    // Why: a backgrounded session runs in a daemon worker that inherited the dispatching
    // pane's env, so ORCA_PANE_KEY names a pane this session does not run in (#9236).
    'if [ -n "$CLAUDE_JOB_DIR" ]; then',
    '  exit 0',
    'fi',
    // Why: refresh endpoint coordinates for PTYs surviving an ARCA restart.
    // Why: suppress parse errors so they neither leak nor trip outer set -e.
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  unset ORCA_AGENT_HOOK_TRANSPORT',
    '  . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ] || [ -z "$ORCA_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Why: keep full hook JSON off the command line and avoid IDS-friendly URL-encoded paths.
    'orca_post_hook() {',
    ...buildPosixAgentHookPostCommand('claude').map((line) => `  ${line}`),
    '}',
    buildPosixHookResponseMaxTimeLine(),
    // Why the subshell: ARCA answers a prompt submission with inbox context, and Claude appends
    // non-JSON hook stdout to the turn. Every other event answers 204, so nothing is printed.
    'orca_hook_response=$(orca_post_hook 2>/dev/null) || spool_hook_event',
    ...buildPosixHookResponseEmitLines(),
    'exit 0',
    ''
  ].join('\n')
}
