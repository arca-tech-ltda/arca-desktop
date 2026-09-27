/** Shell fragments that let a managed hook print ARCA's answer to a prompt submission.
 *  The server only ever sends a body for UserPromptSubmit (hook-prompt-context.ts); the event
 *  guard here is defence in depth, because printing anything on another event would corrupt the
 *  permission JSON a Claude-compatible hook must emit. */
import { WINDOWS_HOOK_STDIN_READER } from './hook-stdin-contract'

/** Above the gateway round trip ARCA waits for, still inside the CLI's own hook timeout. */
export const HOOK_PROMPT_RESPONSE_MAX_TIME_SECONDS = 4
/** Every other event posts and leaves; widening them would slow down each turn for nothing. */
export const HOOK_DEFAULT_MAX_TIME_SECONDS = 1.5

/** Widen curl's budget for the one event that waits on an answer. */
export function buildPosixHookResponseMaxTimeLine(): string {
  return `case "$payload" in *UserPromptSubmit*) max_time=${HOOK_PROMPT_RESPONSE_MAX_TIME_SECONDS} ;; esac`
}

/**
 * The same per-event budget in cmd. Unlike the shell, cmd cannot capture stdin into a variable, so
 * the payload is buffered into a temp file (the statusline hook's shape) and posted from there;
 * that file is also what tells this hook whether it is the prompt event.
 */
export function buildWindowsHookPromptBudgetLines(options: {
  payloadVariable: string
  maxTimeVariable: string
}): {
  capture: string[]
  payloadReference: string
  maxTimeReference: string
  cleanup: string[]
} {
  const payload = `%${options.payloadVariable}%`
  return {
    capture: [
      `set "${options.payloadVariable}=%TEMP%\\orca-hook-payload-%RANDOM%%RANDOM%.json"`,
      `${WINDOWS_HOOK_STDIN_READER} >"${payload}" 2>nul`,
      `set "${options.maxTimeVariable}=${HOOK_DEFAULT_MAX_TIME_SECONDS}"`,
      // Why \": the MSVC argv escape makes findstr match the quoted JSON value, so a cwd or command
      // containing UserPromptSubmit cannot widen another event's budget (POSIX guard parity).
      `"%SystemRoot%\\System32\\findstr.exe" /c:\\"UserPromptSubmit\\" "${payload}" >nul 2>nul`,
      `if not errorlevel 1 set "${options.maxTimeVariable}=${HOOK_PROMPT_RESPONSE_MAX_TIME_SECONDS}"`
    ],
    payloadReference: payload,
    maxTimeReference: `%${options.maxTimeVariable}%`,
    cleanup: [`if exist "${payload}" del /q "${payload}" 2>nul`]
  }
}

/** cmd lines around the post: declare the response file, then print it (empty \u21d2 nothing) and drop it. */

export function buildWindowsHookResponseLines(variable: string): {
  declare: string
  reference: string
  emit: string[]
} {
  return {
    declare: `set "${variable}=%TEMP%\\orca-hook-%RANDOM%%RANDOM%.txt"`,
    reference: `%${variable}%`,
    emit: [
      `if exist "%${variable}%" type "%${variable}%" 2>nul`,
      `if exist "%${variable}%" del /q "%${variable}%" 2>nul`
    ]
  }
}

export function buildPosixHookResponseEmitLines(
  variable = 'orca_hook_response'
): readonly string[] {
  return [
    'case "$payload" in',
    '  *UserPromptSubmit*)',
    `    if [ -n "\${${variable}:-}" ]; then printf '%s\\n' "$${variable}"; fi`,
    '    ;;',
    'esac'
  ]
}
