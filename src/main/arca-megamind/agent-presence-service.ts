import {
  setAgentHookPromptContextProvider,
  type AgentHookPromptContextProvider
} from '../agent-hooks/hook-prompt-context'
import { registerPaneKeyTeardownListener } from '../ipc/pty/pane/key-state'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { readCredential, type DeviceCredential } from './credentials'
import { callTool } from './gateway'
import { MegamindAgentSessions, type MegamindAgentHarness } from './agent-sessions'
import { megamindPaneSessionId } from './megamind-pane-session-id'

const HARNESS_BY_SOURCE: Record<string, MegamindAgentHarness> = {
  claude: 'claude-code',
  codex: 'codex'
}
/** Presence starts at these; Pi is excluded on purpose — the Pi extension registers itself. */
const START_EVENTS = new Set(['SessionStart', 'UserPromptSubmit'])
const END_EVENTS = new Set(['SessionEnd'])
/** Claude fires SessionEnd on `/clear` too; handing off there tells everyone the pane closed. */
const NON_EXIT_END_REASONS = new Set(['clear', 'compact'])

let sessions: MegamindAgentSessions | null = null
let stopTeardown: (() => void) | null = null

/** Minutes of silence after which a pane stops being renewed; `ARCA_MEGAMIND_IDLE_MINUTES` overrides. */
export function configuredIdleMs(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const minutes = Number(env.ARCA_MEGAMIND_IDLE_MINUTES)
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 1440) * 60_000 : undefined
}

/**
 * Presence for the agent terminals of this app: the hooks are the only signal that a Claude Code
 * or Codex session is alive in a pane, and the credential decides whether any of it leaves the
 * machine. No credential (device never enrolled) ⇒ every call fails and the service stays silent.
 */
export function startMegamindAgentPresence(configPath: string, development: boolean): void {
  if (sessions) {
    return
  }
  let credential: DeviceCredential | undefined
  const idleMs = configuredIdleMs()
  const service = new MegamindAgentSessions({
    ...(idleMs === undefined ? {} : { idleMs }),
    callTool: async (name: string, args: MegamindRecord) => {
      credential ??= await readCredential(configPath, development)
      try {
        return await callTool(fetch, credential, name, args)
      } catch (error) {
        // A rotated or revoked credential must be re-read, not cached forever.
        credential = undefined
        throw error
      }
    }
  })
  sessions = service
  setAgentHookPromptContextProvider(createMegamindHookProvider(service))
  stopTeardown = registerPaneKeyTeardownListener((paneKey) => void service.noteSessionEnd(paneKey))
}

/** Which hook events of which CLI move presence, and with what session id. */
export function createMegamindHookProvider(
  service: Pick<MegamindAgentSessions, 'noteActivity' | 'noteSessionEnd' | 'promptContext'>,
  sessionIdForPane: (paneKey: string) => string = megamindPaneSessionId
): AgentHookPromptContextProvider {
  return {
    observe: (observation) => {
      const harness = HARNESS_BY_SOURCE[observation.source]
      if (!harness) {
        return
      }
      if (END_EVENTS.has(observation.hookEventName)) {
        // Reasons of the Claude payload: clear | logout | prompt_input_exit | other. Only `clear`
        // leaves the session alive, and a CLI that sends no reason is taken at its word.
        if (!NON_EXIT_END_REASONS.has(observation.reason ?? '')) {
          void service.noteSessionEnd(observation.paneKey)
        }
        return
      }
      if (!START_EVENTS.has(observation.hookEventName) || !observation.cwd) {
        return
      }
      void service.noteActivity({
        paneKey: observation.paneKey,
        sessionId: sessionIdForPane(observation.paneKey),
        harness,
        cwd: observation.cwd
      })
    },
    promptContext: (observation) => service.promptContext(observation.paneKey)
  }
}

export function stopMegamindAgentPresence(): void {
  stopTeardown?.()
  stopTeardown = null
  setAgentHookPromptContextProvider(null)
  sessions?.stop()
  sessions = null
}
