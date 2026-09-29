import { describe, expect, it, vi } from 'vitest'

import { createAgentStatusExtensionHarness } from './agent-status-extension-test-harness'

type PostedPayload = {
  hook_event_name?: string
  subagents?: { id: string; state: string; startedAt: number; agentType?: string }[]
}

function posts(fetchMock: ReturnType<typeof vi.fn>): PostedPayload[] {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse(String(call[1]?.body)).payload as PostedPayload
  )
}

function lastPost(fetchMock: ReturnType<typeof vi.fn>): PostedPayload {
  return posts(fetchMock).at(-1) ?? {}
}

function runningJobResult(jobId: string, agents: string[]): unknown {
  return { details: { job: { jobId, status: 'running', mode: 'single', agents } } }
}

async function flushPosts(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

/** Dispatch one async `subagent` job the way Pi does: the tool call carries role and
 *  task, the lifecycle event carries the job id, and the tool result joins the two. */
async function launchJob(
  harness: ReturnType<typeof createAgentStatusExtensionHarness>,
  args: { jobId: string; toolCallId?: string; input: Record<string, unknown>; agents: string[] }
): Promise<void> {
  const toolCallId = args.toolCallId ?? 'call-1'
  await harness.callHook('tool_call', { toolCallId, toolName: 'subagent', input: args.input })
  harness.emitPiEvent('subagent:async-started', { id: args.jobId })
  await harness.callHook('tool_execution_end', {
    toolCallId,
    toolName: 'subagent',
    result: runningJobResult(args.jobId, args.agents)
  })
  await flushPosts()
}

describe('pi subagent rows', () => {
  it('reports a running job as one child with its role and first task line', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await launchJob(harness, {
      jobId: 'job-1',
      input: { agent: 'scout', task: '  Map the auth flow  \nMore detail here' },
      agents: ['scout']
    })

    expect(lastPost(harness.fetchMock).subagents).toEqual([
      {
        id: 'job-1',
        state: 'working',
        startedAt: expect.any(Number),
        agentType: 'scout',
        description: 'Map the auth flow'
      }
    ])
  })

  it('reports one child per task in parallel mode', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await launchJob(harness, {
      jobId: 'job-2',
      input: {
        tasks: [
          { agent: 'scout', task: 'Read the store' },
          { agent: 'reviewer', task: 'Review the diff' }
        ]
      },
      agents: ['scout', 'reviewer']
    })

    expect(lastPost(harness.fetchMock).subagents).toMatchObject([
      { id: 'job-2:0', agentType: 'scout', description: 'Read the store' },
      { id: 'job-2:1', agentType: 'reviewer', description: 'Review the diff' }
    ])
  })

  it('drops the child when the job lifecycle completes mid-turn', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await launchJob(harness, {
      jobId: 'job-3',
      input: { agent: 'worker', task: 'Write the migration' },
      agents: ['worker']
    })

    harness.emitPiEvent('subagent:async-complete', { id: 'job-3' })
    await flushPosts()

    const last = lastPost(harness.fetchMock)
    // Why: a child ending is not a lead transition, so the pane's own state must not move.
    expect(last.hook_event_name).toBe('subagent_update')
    expect(last.subagents).toBeUndefined()
  })

  it('reports the completion with an empty roster when the lead was waiting on the child', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await launchJob(harness, {
      jobId: 'job-4',
      input: { agent: 'scout', task: 'Scan the repo' },
      agents: ['scout']
    })
    await harness.callHook('agent_settled', undefined, { isIdle: () => true })
    await flushPosts()
    expect(lastPost(harness.fetchMock).hook_event_name).toBe('tool_execution_end')

    harness.emitPiEvent('subagent:async-complete', { id: 'job-4' })
    await flushPosts()

    expect(lastPost(harness.fetchMock)).toEqual({ hook_event_name: 'agent_end' })
  })

  it('drops a child whose job record already settled, before its lifecycle event', async () => {
    vi.useFakeTimers()
    try {
      let recordStatus = 'running'
      const harness = createAgentStatusExtensionHarness({
        kind: 'pi',
        readFileSync: (path) => {
          if (path.endsWith('/subagent-jobs/session-1/job-5.json')) {
            return JSON.stringify({ jobId: 'job-5', status: recordStatus })
          }
          throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
        },
        env: { HOME: '/home/dev' }
      })
      const context = { sessionManager: { getSessionId: () => 'session-1' } }
      await harness.callHook('session_start', {}, context)
      await harness.callHook('agent_start', undefined, context)
      await launchJob(harness, {
        jobId: 'job-5',
        input: { agent: 'worker', task: 'Long job' },
        agents: ['worker']
      })
      expect(lastPost(harness.fetchMock).subagents).toMatchObject([{ description: 'Long job' }])

      // Cancelled mid-turn: the record settles long before the delivery that ends the
      // job's lifecycle. The sweep is throttled, so the next post past the window sees it.
      recordStatus = 'cancelled'
      vi.advanceTimersByTime(2_000)
      await harness.callHook('tool_call', { toolName: 'read', input: {} }, context)
      await vi.advanceTimersByTimeAsync(10)

      expect(lastPost(harness.fetchMock).subagents).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the roster across an extension reload', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await launchJob(harness, {
      jobId: 'job-6',
      input: { agent: 'scout', task: 'Inventory the hooks' },
      agents: ['scout']
    })

    harness.reload()
    await harness.callHook('tool_execution_end', { toolName: 'read' })
    await flushPosts()

    expect(lastPost(harness.fetchMock).subagents).toMatchObject([
      { id: 'job-6', agentType: 'scout' }
    ])
  })

  it('reports no children for a control call or an unrelated tool', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi' })
    await harness.callHook('agent_start')
    await harness.callHook('tool_call', {
      toolCallId: 'call-9',
      toolName: 'subagent',
      input: { action: 'list' }
    })
    await harness.callHook('tool_execution_end', {
      toolCallId: 'call-9',
      toolName: 'subagent',
      result: { details: { jobs: [] } }
    })
    await flushPosts()

    expect(lastPost(harness.fetchMock).subagents).toBeUndefined()
  })
})
