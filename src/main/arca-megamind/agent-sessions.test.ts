import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MegamindRecord } from '../../shared/arca-megamind'
import { MegamindAgentSessions, sessionLabel } from './agent-sessions'

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'

type Call = { name: string; args: MegamindRecord }

function harness(options: { fail?: boolean | (() => Error); inbox?: MegamindRecord[] } = {}) {
  const calls: Call[] = []
  const callTool = vi.fn(async (name: string, args: MegamindRecord): Promise<MegamindRecord> => {
    calls.push({ name, args })
    if (options.fail) {
      throw options.fail === true ? new Error('no credential') : options.fail()
    }
    if (name === 'projects_list') {
      return { items: [{ id: 'mainframe', repos: ['github.com/arca-tech/infra'] }] }
    }
    if (name === 'inbox') {
      return { items: options.inbox ?? [] }
    }
    return { session_id: String(args.session_id ?? '') }
  })
  const sessions = new MegamindAgentSessions({
    callTool,
    hostname: () => 'mac-do-biel',
    readWorkspaceFacts: async () => ({
      root: '/Users/biel/ARCA/Infra',
      repoKey: 'github.com/arca-tech/infra',
      branch: 'feat/a'
    })
  })
  return { calls, callTool, sessions }
}

const activity = { paneKey: PANE, sessionId: SESSION, harness: 'claude-code' as const, cwd: '/x' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('presence', () => {
  it('registers the pane session with project, harness, label and branch', async () => {
    const { calls, sessions } = harness()
    await sessions.noteActivity(activity)
    sessions.stop()

    expect(calls.map((call) => call.name)).toEqual(['projects_list', 'register_agent'])
    expect(calls[1]!.args).toEqual({
      session_id: SESSION,
      project_id: 'mainframe',
      harness: 'claude-code',
      label: 'claude-code mainframe@mac-do-biel',
      branch: 'feat/a'
    })
  })

  it('coalesces repeated activity into one register per heartbeat period', async () => {
    const { calls, sessions } = harness()
    await Promise.all([
      sessions.noteActivity(activity),
      sessions.noteActivity(activity),
      sessions.noteActivity(activity)
    ])
    await sessions.noteActivity(activity)
    expect(calls.filter((call) => call.name === 'register_agent')).toHaveLength(1)

    vi.advanceTimersByTime(61_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.filter((call) => call.name === 'register_agent')).toHaveLength(2)
    sessions.stop()
  })

  it('heartbeats a live pane and stops renewing it once idle', async () => {
    const { calls, sessions } = harness()
    await sessions.noteActivity(activity)
    for (let minute = 0; minute < 4; minute += 1) {
      await vi.advanceTimersByTimeAsync(60_000)
    }
    const beats = calls.filter((call) => call.name === 'register_agent').length
    expect(beats).toBe(5)

    // Idle past the configured window: no unregister, just no more renewals (§2.3).
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    const afterIdle = calls.filter((call) => call.name === 'register_agent').length
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(calls.filter((call) => call.name === 'register_agent')).toHaveLength(afterIdle)
    expect(calls.some((call) => call.name === 'handoff')).toBe(false)
    sessions.stop()
  })

  it('hands off when the pane closes, once', async () => {
    const { calls, sessions } = harness()
    await sessions.noteActivity(activity)
    await sessions.noteSessionEnd(PANE)
    await sessions.noteSessionEnd(PANE)

    const handoffs = calls.filter((call) => call.name === 'handoff')
    expect(handoffs).toHaveLength(1)
    expect(handoffs[0]!.args.session_id).toBe(SESSION)
  })

  it('stays silent when the device has no Megamind credential', async () => {
    const { calls, sessions } = harness({ fail: true })
    await expect(sessions.noteActivity(activity)).resolves.toBe(false)
    await expect(sessions.promptContext(PANE)).resolves.toBeNull()
    await sessions.noteSessionEnd(PANE)

    // One attempt proves the credential is missing; nothing else reaches the gateway.
    expect(calls).toHaveLength(1)
    sessions.stop()
  })
})

describe('inbox as prompt context', () => {
  const inbox = [
    { kind: 'message', id: 'abcdefghij12345', from_owner_name: 'enzo', body: 'olha o deploy' },
    { kind: 'request', id: 'bbcdefghij12345', title: 'Revisar', body: 'o dispatcher' }
  ]

  it('returns a short summary with ids and acknowledges what it delivered', async () => {
    const { calls, sessions } = harness({ inbox })
    await sessions.noteActivity(activity)
    const context = await sessions.promptContext(PANE)

    expect(context?.text).toContain('2 itens pendentes')
    expect(context?.text).toContain('abcdefghij12345')
    expect(context?.text).toContain('enzo')
    // The gateway is told only after the caller confirms the body reached the agent.
    expect(calls.some((call) => call.name === 'acknowledge')).toBe(false)
    await context?.delivered()
    expect(calls.at(-1)).toEqual({
      name: 'acknowledge',
      args: { session_id: SESSION, ids: ['abcdefghij12345', 'bbcdefghij12345'] }
    })
    sessions.stop()
  })

  it('registers the pane first when the prompt is its first event', async () => {
    const { calls, sessions } = harness({ inbox })
    sessions.noteActivity(activity)
    const context = await sessions.promptContext(PANE)

    expect(context).not.toBeNull()
    expect(calls.filter((call) => call.name === 'register_agent')).toHaveLength(1)
    sessions.stop()
  })

  it('returns nothing for an empty inbox and acknowledges nothing', async () => {
    const { calls, sessions } = harness()
    await sessions.noteActivity(activity)
    await expect(sessions.promptContext(PANE)).resolves.toBeNull()
    expect(calls.some((call) => call.name === 'acknowledge')).toBe(false)
    sessions.stop()
  })

  it('does not wait on a stale registration before reading the inbox', async () => {
    const { calls, callTool, sessions } = harness({ inbox })
    await sessions.noteActivity(activity)

    // Past the heartbeat period the registration is stale; a gateway that never answers it must
    // not hold the prompt.
    vi.setSystemTime(Date.now() + 61_000)
    callTool.mockImplementation(async (name: string, args: MegamindRecord) => {
      calls.push({ name, args })
      if (name === 'register_agent') {
        return new Promise<MegamindRecord>(() => {})
      }
      return name === 'inbox' ? { items: inbox } : { session_id: String(args.session_id ?? '') }
    })

    const context = await sessions.promptContext(PANE)

    expect(context?.text).toContain('2 itens pendentes')
    // The refresh still went out, behind the inbox call.
    expect(calls.map((call) => call.name)).toContain('register_agent')
    sessions.stop()
  })

  it('returns nothing for a pane with no agent session', async () => {
    const { sessions } = harness({ inbox })
    await expect(sessions.promptContext(PANE)).resolves.toBeNull()
    sessions.stop()
  })
})

describe('failure handling', () => {
  it('mutes presence for five minutes when the device cannot authenticate', async () => {
    const { calls, sessions } = harness({ fail: () => new Error('Megamind HTTP 401') })
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(1)

    vi.setSystemTime(Date.now() + 4 * 60_000)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(1)

    vi.setSystemTime(Date.now() + 61_000)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(2)
    sessions.stop()
  })

  it('backs a rate limit off in seconds, growing only while it keeps failing', async () => {
    const { calls, sessions } = harness({ fail: () => new Error('Megamind HTTP 429') })
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(1)

    // Still inside the first 2 s wait.
    vi.setSystemTime(Date.now() + 1_000)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(1)

    vi.setSystemTime(Date.now() + 1_500)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(2)

    // Second consecutive failure doubles the wait, so 2 s is no longer enough.
    vi.setSystemTime(Date.now() + 2_500)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(2)

    vi.setSystemTime(Date.now() + 2_000)
    await sessions.noteActivity(activity)
    expect(calls).toHaveLength(3)
    sessions.stop()
  })

  it('clears the backoff as soon as one call succeeds', async () => {
    const { callTool, sessions } = harness()
    callTool.mockRejectedValueOnce(new Error('Megamind HTTP 503'))
    await sessions.noteActivity(activity)
    vi.setSystemTime(Date.now() + 2_100)
    await sessions.noteActivity(activity)
    expect(callTool).toHaveBeenCalledTimes(2)

    // A later failure starts from the short wait again, not from where the old one stopped.
    callTool.mockRejectedValueOnce(new Error('fetch failed'))
    vi.setSystemTime(Date.now() + 61_000)
    await sessions.noteActivity(activity)
    vi.setSystemTime(Date.now() + 2_100)
    await sessions.noteActivity(activity)
    expect(callTool).toHaveBeenCalledTimes(4)
    sessions.stop()
  })
})

it('stops calling the gateway past the per-device window', async () => {
  const { calls, sessions } = harness()
  for (let pane = 0; pane < 80; pane += 1) {
    await sessions.noteActivity({
      ...activity,
      paneKey: `tab-1:1111111${pane % 10}-1111-4111-8111-11111111111${pane % 10}`,
      sessionId: `${pane}`
    })
  }
  expect(calls.length).toBeLessThanOrEqual(60)
  sessions.stop()
})

it('builds a label inside the 8..80 rune bound', () => {
  expect(sessionLabel('codex', 'a', 'b')).toBe('codex a@b')
  expect(sessionLabel('pi', 'a', 'b')).toBe('pi a@b session')
  expect([...sessionLabel('claude-code', 'x'.repeat(64), 'y'.repeat(64))]).toHaveLength(80)
})
