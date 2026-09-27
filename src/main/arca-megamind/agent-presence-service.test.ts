import { expect, it, vi } from 'vitest'
import { configuredIdleMs, createMegamindHookProvider } from './agent-presence-service'
import type { AgentHookObservation } from '../agent-hooks/hook-prompt-context'
import type { MegamindAgentActivity } from './agent-sessions'

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

function provider() {
  const service = {
    noteActivity: vi.fn(async (_activity: MegamindAgentActivity) => true),
    noteSessionEnd: vi.fn(async (_paneKey: string) => {}),
    promptContext: vi.fn(async (_paneKey: string) => ({
      text: 'contexto',
      delivered: async () => {}
    }))
  }
  return { service, hooks: createMegamindHookProvider(service, () => 'session-do-pane') }
}

function observation(patch: Partial<AgentHookObservation>): AgentHookObservation {
  return { source: 'claude', paneKey: PANE, hookEventName: 'SessionStart', cwd: '/repo', ...patch }
}

it('takes the idle window from the environment, bounded', () => {
  expect(configuredIdleMs({})).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: 'nao' })).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '0' })).toBeUndefined()
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '5' })).toBe(300_000)
  expect(configuredIdleMs({ ARCA_MEGAMIND_IDLE_MINUTES: '99999' })).toBe(1440 * 60_000)
})

it('registers the pane on the start events of Claude Code and Codex', () => {
  const { service, hooks } = provider()
  hooks.observe(observation({}))
  hooks.observe(observation({ source: 'codex', hookEventName: 'UserPromptSubmit' }))

  expect(service.noteActivity.mock.calls.map(([activity]) => activity)).toEqual([
    { paneKey: PANE, sessionId: 'session-do-pane', harness: 'claude-code', cwd: '/repo' },
    { paneKey: PANE, sessionId: 'session-do-pane', harness: 'codex', cwd: '/repo' }
  ])
})

it('ignores Pi and every other source, and events that are not a session boundary', () => {
  const { service, hooks } = provider()
  hooks.observe(observation({ source: 'pi' }))
  hooks.observe(observation({ source: 'gemini' }))
  hooks.observe(observation({ hookEventName: 'Stop' }))
  hooks.observe(observation({ hookEventName: 'PreToolUse' }))
  hooks.observe(observation({ cwd: null }))

  expect(service.noteActivity).not.toHaveBeenCalled()
  expect(service.noteSessionEnd).not.toHaveBeenCalled()
})

it('hands off on SessionEnd but never on Stop', () => {
  const { service, hooks } = provider()
  hooks.observe(observation({ hookEventName: 'Stop' }))
  expect(service.noteSessionEnd).not.toHaveBeenCalled()

  hooks.observe(observation({ hookEventName: 'SessionEnd' }))
  expect(service.noteSessionEnd).toHaveBeenCalledWith(PANE)
})

it('asks the pane session for the prompt context', async () => {
  const { service, hooks } = provider()
  await expect(
    hooks.promptContext(observation({ hookEventName: 'UserPromptSubmit' }))
  ).resolves.toMatchObject({ text: 'contexto' })
  expect(service.promptContext).toHaveBeenCalledWith(PANE)
})
