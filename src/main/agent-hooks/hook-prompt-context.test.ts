import { afterEach, expect, it, vi } from 'vitest'
import { AgentHookServer } from './server'
import {
  buildHookContextResponse,
  readAgentHookObservation,
  resolveAgentHookContextResponse,
  setAgentHookPromptContextProvider,
  type AgentHookObservation,
  type AgentHookPromptContext
} from './hook-prompt-context'

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return { paneKey: PANE, tabId: 'tab-1', env: 'production', payload: JSON.stringify(payload) }
}

afterEach(() => {
  setAgentHookPromptContextProvider(null)
  vi.restoreAllMocks()
})

it('reads pane, event and cwd off a Claude or Codex envelope only', () => {
  expect(
    readAgentHookObservation('claude', envelope({ hook_event_name: 'SessionStart', cwd: '/repo' }))
  ).toEqual({ source: 'claude', paneKey: PANE, hookEventName: 'SessionStart', cwd: '/repo' })
  expect(
    readAgentHookObservation('codex', { ...envelope({ hook_event_name: 'Stop' }), payload: { hook_event_name: 'Stop' } })
  ).toEqual({ source: 'codex', paneKey: PANE, hookEventName: 'Stop', cwd: null })
  expect(readAgentHookObservation('gemini', envelope({ hook_event_name: 'Stop' }))).toBeNull()
  expect(readAgentHookObservation('claude', { paneKey: PANE })).toBeNull()
})

it('shapes the answer for each CLI hook contract', () => {
  const delivered = vi.fn()
  const context = { text: 'dois pedidos', delivered }
  expect(buildHookContextResponse('claude', context)).toMatchObject({
    contentType: 'text/plain; charset=utf-8',
    body: 'dois pedidos\n'
  })
  expect(JSON.parse(buildHookContextResponse('codex', context)!.body)).toEqual({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'dois pedidos' }
  })
  expect(buildHookContextResponse('claude', { text: '  ', delivered })).toBeNull()
  expect(delivered).not.toHaveBeenCalled()
})

it('only asks for context on a prompt submission, and gives up on a slow gateway', async () => {
  const promptContext = vi.fn(
    async (): Promise<AgentHookPromptContext | null> => ({
      text: 'pendências',
      delivered: () => {}
    })
  )
  const observe = vi.fn()
  setAgentHookPromptContextProvider({ observe, promptContext })

  const start = envelope({ hook_event_name: 'SessionStart', cwd: '/repo' })
  expect(await resolveAgentHookContextResponse('claude', start)).toBeNull()
  expect(observe).toHaveBeenCalledTimes(1)
  expect(promptContext).not.toHaveBeenCalled()

  const prompt = envelope({ hook_event_name: 'UserPromptSubmit', cwd: '/repo' })
  expect(await resolveAgentHookContextResponse('claude', prompt)).toMatchObject({
    contentType: 'text/plain; charset=utf-8',
    body: 'pendências\n'
  })

  promptContext.mockImplementation(() => new Promise(() => null))
  expect(await resolveAgentHookContextResponse('claude', prompt, 5)).toBeNull()
})

it('never lets a throwing provider break the hook', async () => {
  setAgentHookPromptContextProvider({
    observe: () => {
      throw new Error('boom')
    },
    promptContext: () => Promise.reject(new Error('boom'))
  })
  const prompt = envelope({ hook_event_name: 'UserPromptSubmit', cwd: '/repo' })
  await expect(resolveAgentHookContextResponse('codex', prompt)).resolves.toBeNull()
})

it('answers the live hook request with the context body', async () => {
  const observed: AgentHookObservation[] = []
  const acknowledged: string[] = []
  setAgentHookPromptContextProvider({
    observe: (observation) => observed.push(observation),
    promptContext: async () => ({
      text: 'ARCA Megamind — 1 item pendente',
      delivered: () => {
        acknowledged.push('ok')
      }
    })
  })
  const server = new AgentHookServer()
  await server.start({ env: 'production' })
  try {
    const env = server.buildPtyEnv()
    const post = (payload: Record<string, unknown>): Promise<Response> =>
      fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/claude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN,
          'X-Orca-Agent-Hook-Meta-Encoding': 'base64',
          'X-Orca-Agent-Hook-Meta': Buffer.from(
            [PANE, 'tab-1', '', 'wt-1', 'production', ''].join('\x1f')
          ).toString('base64')
        },
        body: JSON.stringify(payload)
      })

    const started = await post({ hook_event_name: 'SessionStart', cwd: '/repo' })
    expect(started.status).toBe(204)

    const prompted = await post({ hook_event_name: 'UserPromptSubmit', prompt: 'oi', cwd: '/repo' })
    expect(prompted.status).toBe(200)
    expect(await prompted.text()).toBe('ARCA Megamind — 1 item pendente\n')
    expect(observed.map((observation) => observation.hookEventName)).toEqual([
      'SessionStart',
      'UserPromptSubmit'
    ])
    // Acknowledged only once the body was written.
    expect(acknowledged).toEqual(['ok'])
    // The status pipeline still ran for the same request.
    expect(server.getStatusSnapshot()).toEqual([
      expect.objectContaining({ paneKey: PANE, state: 'working', prompt: 'oi' })
    ])
  } finally {
    server.stop()
  }
})
