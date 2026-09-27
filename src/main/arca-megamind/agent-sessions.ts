import { hostname } from 'node:os'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { records } from './gateway'
import {
  createCachedWorkspaceFactsReader,
  indexProjectsByRepoKey,
  resolveProjectId,
  type MegamindWorkspaceFacts
} from './agent-session-project'
import { formatInboxContext } from './agent-session-inbox-context'

export type MegamindAgentHarness = 'claude-code' | 'codex'

export type MegamindAgentActivity = {
  paneKey: string
  sessionId: string
  harness: MegamindAgentHarness
  cwd: string
}

export type MegamindPromptContext = {
  text: string
  /** Confirms the items to the gateway; until it runs they are redelivered. */
  delivered: () => Promise<void>
}

export type MegamindAgentSessionsDeps = {
  /** Rejects when the device has no Megamind credential — that is the silent no-op path. */
  callTool: (name: string, args: MegamindRecord) => Promise<MegamindRecord>
  now?: () => number
  hostname?: () => string
  readWorkspaceFacts?: (cwd: string) => Promise<MegamindWorkspaceFacts>
  /** Idle time after which a pane stops being heartbeaten and expires on the gateway. */
  idleMs?: number
}

/** `active` on the gateway is `last_seen` ≤ 120 s (§2.3), so beat at half of it. */
const HEARTBEAT_MS = 60_000
const DEFAULT_IDLE_MS = 30 * 60_000
/** Under the gateway's 120 req/min per device (§2.12), leaving room for the app's inbox poll. */
const RATE_LIMIT_PER_MINUTE = 60
const PROJECT_INDEX_TTL_MS = 10 * 60_000
const BACKOFF_MS = 5 * 60_000
const INBOX_LIMIT = 10

type PaneSession = {
  sessionId: string
  harness: MegamindAgentHarness
  cwd: string
  projectId?: string
  lastActivityAt: number
  lastRegisterAt: number
  registering?: Promise<boolean>
  registered: boolean
}

/**
 * The app is the owner of Megamind presence for the agent terminals it launches: the CLIs
 * themselves only speak MCP, and a `register_agent` from the proxy would mint a second session per
 * process. One pane = one session id = one presence, kept alive while that pane has a live agent.
 */
export class MegamindAgentSessions {
  private readonly panes = new Map<string, PaneSession>()
  private readonly deps: Required<Omit<MegamindAgentSessionsDeps, 'callTool'>> & {
    callTool: MegamindAgentSessionsDeps['callTool']
  }
  private heartbeat?: ReturnType<typeof setInterval>
  private projectIndex?: { value: Map<string, string>; expires: number }
  private windowStart = 0
  private windowCalls = 0
  private mutedUntil = 0

  constructor(deps: MegamindAgentSessionsDeps) {
    this.deps = {
      callTool: deps.callTool,
      now: deps.now ?? Date.now,
      hostname: deps.hostname ?? hostname,
      readWorkspaceFacts: deps.readWorkspaceFacts ?? createCachedWorkspaceFactsReader(),
      idleMs: deps.idleMs ?? DEFAULT_IDLE_MS
    }
  }

  /** SessionStart/UserPromptSubmit of a Claude Code or Codex pane. Never throws. */
  noteActivity(activity: MegamindAgentActivity): Promise<boolean> {
    const now = this.deps.now()
    const existing = this.panes.get(activity.paneKey)
    const pane: PaneSession =
      existing?.sessionId === activity.sessionId
        ? { ...existing, cwd: activity.cwd, harness: activity.harness, lastActivityAt: now }
        : {
            sessionId: activity.sessionId,
            harness: activity.harness,
            cwd: activity.cwd,
            lastActivityAt: now,
            lastRegisterAt: 0,
            registered: false
          }
    this.panes.set(activity.paneKey, pane)
    this.startHeartbeat()
    return this.ensureRegistered(activity.paneKey)
  }

  /** Pane closed or SessionEnd: hand the work off; the session then ages out on its own. */
  async noteSessionEnd(paneKey: string): Promise<void> {
    const pane = this.panes.get(paneKey)
    this.panes.delete(paneKey)
    if (!this.panes.size) {
      this.stopHeartbeat()
    }
    if (!pane?.registered || !this.take()) {
      return
    }
    await this.call('handoff', {
      session_id: pane.sessionId,
      summary: `Terminal do ARCA Desktop fechado (${pane.harness}).`
    })
  }

  /**
   * Pending inbox of this pane as prompt context. `acknowledge` is the caller's to make, after the
   * text is really on its way to the agent: a prompt that timed out must keep its items pending.
   */
  async promptContext(paneKey: string): Promise<MegamindPromptContext | null> {
    // The first prompt of a pane races its own registration; the inbox needs the session to exist.
    // A pane that is already registered never waits: renewing presence is not what the prompt is
    // here for, so a stale registration is refreshed behind the inbox call, not in front of it.
    if (this.panes.get(paneKey)?.registered) {
      void this.ensureRegistered(paneKey).catch(() => {})
    } else if (!(await this.ensureRegistered(paneKey))) {
      return null
    }
    const pane = this.panes.get(paneKey)
    if (!pane?.registered || !this.take()) {
      return null
    }
    const sessionId = pane.sessionId
    const inbox = await this.call('inbox', { session_id: sessionId, limit: INBOX_LIMIT })
    const context = inbox ? formatInboxContext(records(inbox)) : null
    if (!context) {
      return null
    }
    return {
      text: context.text,
      delivered: async () => {
        if (this.take()) {
          await this.call('acknowledge', { session_id: sessionId, ids: context.ids })
        }
      }
    }
  }

  stop(): void {
    this.stopHeartbeat()
    this.panes.clear()
  }

  private startHeartbeat(): void {
    if (this.heartbeat) {
      return
    }
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_MS)
    this.heartbeat.unref?.()
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  private async beat(): Promise<void> {
    const now = this.deps.now()
    // Snapshot: the loop awaits and drops panes as it goes.
    const panes = Array.from(this.panes)
    for (const [paneKey, pane] of panes) {
      if (now - pane.lastActivityAt > this.deps.idleMs) {
        // Stop does not unregister: an idle pane just stops being renewed and expires (§2.3).
        this.panes.delete(paneKey)
        continue
      }
      await this.ensureRegistered(paneKey)
    }
    if (!this.panes.size) {
      this.stopHeartbeat()
    }
  }

  /** Coalesced per pane: one in-flight `register_agent`, and at most one per heartbeat period. */
  private ensureRegistered(paneKey: string): Promise<boolean> {
    const pane = this.panes.get(paneKey)
    if (!pane) {
      return Promise.resolve(false)
    }
    if (pane.registering) {
      return pane.registering
    }
    if (pane.registered && this.deps.now() - pane.lastRegisterAt < HEARTBEAT_MS) {
      return Promise.resolve(true)
    }
    const pending = this.register(paneKey, pane).finally(() => {
      const current = this.panes.get(paneKey)
      if (current?.registering === pending) {
        delete current.registering
      }
    })
    pane.registering = pending
    return pending
  }

  private async register(paneKey: string, pane: PaneSession): Promise<boolean> {
    if (!this.take()) {
      return pane.registered
    }
    const facts = await this.deps.readWorkspaceFacts(pane.cwd).catch(() => null)
    if (!facts) {
      return pane.registered
    }
    const projectId = pane.projectId ?? resolveProjectId(facts, await this.projects())
    const label = sessionLabel(pane.harness, projectId, this.deps.hostname())
    const result = await this.call('register_agent', {
      session_id: pane.sessionId,
      project_id: projectId,
      harness: pane.harness,
      label,
      ...(facts.branch ? { branch: facts.branch } : {})
    })
    const current = this.panes.get(paneKey)
    if (!current || current.sessionId !== pane.sessionId) {
      return false
    }
    if (!result) {
      return current.registered
    }
    current.projectId = projectId
    current.registered = true
    current.lastRegisterAt = this.deps.now()
    return true
  }

  private async projects(): Promise<Map<string, string>> {
    const now = this.deps.now()
    if (this.projectIndex && this.projectIndex.expires > now) {
      return this.projectIndex.value
    }
    const page = this.take() ? await this.call('projects_list', { limit: 100 }) : null
    const value = page ? indexProjectsByRepoKey(records(page)) : new Map<string, string>()
    this.projectIndex = { value, expires: now + PROJECT_INDEX_TTL_MS }
    return value
  }

  /** Every gateway call of this service: a failure mutes presence instead of surfacing anywhere. */
  private async call(name: string, args: MegamindRecord): Promise<MegamindRecord | null> {
    if (this.deps.now() < this.mutedUntil) {
      return null
    }
    try {
      return await this.deps.callTool(name, args)
    } catch {
      this.mutedUntil = this.deps.now() + BACKOFF_MS
      return null
    }
  }

  /** One token per gateway call, inside this device's per-minute window. */
  private take(): boolean {
    const now = this.deps.now()
    if (now < this.mutedUntil) {
      return false
    }
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now
      this.windowCalls = 0
    }
    if (this.windowCalls >= RATE_LIMIT_PER_MINUTE) {
      return false
    }
    this.windowCalls += 1
    return true
  }
}

/** Presence label of the contract: 8..80 runes, no controls (§2.2). */
export function sessionLabel(harness: string, projectId: string, host: string): string {
  const label = `${harness} ${projectId}@${host}`.replace(/[\p{Cc}\p{Zl}\p{Zp}\p{Cf}]/gu, '').trim()
  return [...(label.length >= 8 ? label : `${label} session`)].slice(0, 80).join('')
}
