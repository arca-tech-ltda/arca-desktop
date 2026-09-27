import type { AgentHookSource } from '../../shared/agent-hook-relay'
import { parseAgentHookJson } from '../../shared/agent-hook-listener/request-body'

/** Sources whose hook protocol documents a context injection on UserPromptSubmit. */
const CONTEXT_SOURCES = new Set<AgentHookSource>(['claude', 'codex'])
/** Inside the hook script's own `--max-time`, so a slow gateway never stalls the prompt. */
export const HOOK_PROMPT_CONTEXT_TIMEOUT_MS = 1_200

export type AgentHookObservation = {
  source: AgentHookSource
  paneKey: string
  hookEventName: string
  cwd: string | null
}

export type AgentHookPromptContextProvider = {
  /** Every observed hook event of a context source; must never throw. */
  observe: (observation: AgentHookObservation) => void
  /** Context to hand the agent with this prompt, or null. */
  promptContext: (observation: AgentHookObservation) => Promise<string | null>
}

let provider: AgentHookPromptContextProvider | null = null

export function setAgentHookPromptContextProvider(
  next: AgentHookPromptContextProvider | null
): void {
  provider = next
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function readHookPayload(record: Record<string, unknown>): Record<string, unknown> | null {
  const raw = record.payload
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = parseAgentHookJson(raw)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null
}

/** Pane, event name and cwd off the transport envelope, without touching listener state. */
export function readAgentHookObservation(
  source: AgentHookSource,
  body: unknown
): AgentHookObservation | null {
  if (!CONTEXT_SOURCES.has(source) || typeof body !== 'object' || body === null) {
    return null
  }
  const record = body as Record<string, unknown>
  const paneKey = readString(record, ['paneKey'])
  const payload = readHookPayload(record)
  if (!paneKey || !payload) {
    return null
  }
  const hookEventName = readString(payload, ['hook_event_name', 'hookEventName'])
  if (!hookEventName) {
    return null
  }
  return {
    source,
    paneKey,
    hookEventName,
    cwd: readString(payload, ['cwd', 'workspace_dir', 'workspaceDir', 'project_dir'])
  }
}

export type AgentHookContextResponse = { contentType: string; body: string }

/**
 * How each CLI takes extra context from a hook. Claude Code appends non-JSON stdout of a
 * UserPromptSubmit hook to the turn; Codex parses stdout and only accepts its wire object — and
 * ARCA's Claude script already printed `{}` for the permission contract, so its stdout can never
 * be the JSON form.
 */
export function buildHookContextResponse(
  source: AgentHookSource,
  context: string
): AgentHookContextResponse | null {
  if (!context.trim()) {
    return null
  }
  if (source === 'claude') {
    return { contentType: 'text/plain; charset=utf-8', body: `${context}\n` }
  }
  if (source === 'codex') {
    return {
      contentType: 'application/json',
      body: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: context
        }
      })
    }
  }
  return null
}

/** Observe the event and, for a prompt submission, resolve the body the hook should print. */
export async function resolveAgentHookContextResponse(
  source: AgentHookSource,
  body: unknown,
  timeoutMs = HOOK_PROMPT_CONTEXT_TIMEOUT_MS
): Promise<AgentHookContextResponse | null> {
  const current = provider
  if (!current) {
    return null
  }
  const observation = readAgentHookObservation(source, body)
  if (!observation) {
    return null
  }
  try {
    current.observe(observation)
  } catch {
    /* Presence is never allowed to break status ingest. */
  }
  if (observation.hookEventName !== 'UserPromptSubmit') {
    return null
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const context = await Promise.race([
      current.promptContext(observation),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
        timer.unref?.()
      })
    ])
    return context ? buildHookContextResponse(source, context) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
