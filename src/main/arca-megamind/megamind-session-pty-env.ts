import { isWslUncPath } from '../../shared/wsl-paths'
import { parsePaneKey } from '../../shared/stable-pane-id'
import { MEGAMIND_SESSION_ENV_KEY, megamindPaneSessionId } from './megamind-pane-session-id'

export type MegamindSessionPtyEnvInput = {
  /** Stable pane key of the terminal this PTY belongs to. */
  paneKey?: string | null
  /** SSH target. Anything non-null means the agent runs on another host. */
  connectionId?: string | null
  /** WSL guest: the CLI there reads the guest's own config, and the app is not its presence owner. */
  isWsl?: boolean
  cwd?: string | null
}

function isLocalPaneLaunch(input: MegamindSessionPtyEnvInput): boolean {
  return (
    input.isWsl !== true &&
    !input.connectionId?.trim() &&
    !isWslUncPath(input.cwd ?? '') &&
    typeof input.paneKey === 'string' &&
    parsePaneKey(input.paneKey) !== null
  )
}

/**
 * `ARCA_MEGAMIND_SESSION_ID` for a local agent terminal: one id per pane, shared by the MCP proxy
 * inside the CLI and by the presence this app registers from that pane's hooks. Local only in v1 —
 * on SSH/WSL the execution host owns the agent, so a host-side id would name a session nobody runs.
 */
export function applyMegamindSessionPtyEnv(
  env: Record<string, string>,
  input: MegamindSessionPtyEnvInput
): void {
  if (!isLocalPaneLaunch(input)) {
    // Defence in depth: a stale launch config must not carry this computer's session id to another host.
    delete env[MEGAMIND_SESSION_ENV_KEY]
    return
  }
  env[MEGAMIND_SESSION_ENV_KEY] = megamindPaneSessionId(input.paneKey!)
}
