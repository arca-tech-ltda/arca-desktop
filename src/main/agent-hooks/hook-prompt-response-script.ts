/** Shell fragments that let a managed hook print ARCA's answer to a prompt submission.
 *  The server only ever sends a body for UserPromptSubmit (hook-prompt-context.ts); the event
 *  guard here is defence in depth, because printing anything on another event would corrupt the
 *  permission JSON a Claude-compatible hook must emit. */

/** Above the gateway round trip ARCA waits for, still inside the CLI's own hook timeout. */
export const HOOK_PROMPT_RESPONSE_MAX_TIME_SECONDS = 4

/** Widen curl's budget for the one event that waits on an answer. */
export function buildPosixHookResponseMaxTimeLine(): string {
  return `case "$payload" in *UserPromptSubmit*) max_time=${HOOK_PROMPT_RESPONSE_MAX_TIME_SECONDS} ;; esac`
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
