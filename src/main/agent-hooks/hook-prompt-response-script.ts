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
