import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MegamindToolError } from './gateway'
import type * as Gateway from './gateway'
import type * as Credentials from './credentials'

const callTool = vi.fn()
const events = vi.fn()

vi.mock('./gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof Gateway>()),
  callTool: (...args: unknown[]) => callTool(...args),
  startMegamindEvents: (...args: unknown[]) => {
    events(...args)
    return () => {}
  }
}))
vi.mock('./credentials', async (importOriginal) => ({
  ...(await importOriginal<typeof Credentials>()),
  readCredential: async () => ({ endpoint: 'https://mainframe.example/api/arca/mcp', token: 't' })
}))

const { MegamindDeviceClient } = await import('./device-client')

type Tool = { name: string; args: Record<string, unknown> }

let calls: Tool[] = []
let sessionPath = ''
let notified: Record<string, unknown>[] = []

beforeEach(async () => {
  calls = []
  notified = []
  sessionPath = join(await mkdtemp(join(tmpdir(), 'megamind-')), 'sessions.json')
  callTool.mockReset()
  events.mockReset()
})
afterEach(() => vi.restoreAllMocks())

function client(): InstanceType<typeof MegamindDeviceClient> {
  return new MegamindDeviceClient(
    join(tmpdir(), 'megamind-config.json'),
    true,
    sessionPath,
    (item) => {
      notified.push(item)
      return true
    },
    () => {}
  )
}

function record(name: string, args: Record<string, unknown>): void {
  calls.push({ name, args })
}

const invalidRequest = new MegamindToolError('Megamind tool failed', 'invalid_request: harness')

it('falls back to the agent harness only when the gateway rejects the argument, once per credential', async () => {
  callTool.mockImplementation(async (_fetch, _credential, name, args) => {
    record(name, args)
    if (name === 'register_agent' && args.harness === 'desktop') {
      throw invalidRequest
    }
    return {}
  })
  const device = client()
  await device.createRequest('enzo', 'title', 'body', 'projeto')
  expect(calls.filter((call) => call.name === 'register_agent').map((call) => call.args.harness)) //
    .toEqual(['desktop', 'pi'])

  calls = []
  await device.createRequest('enzo', 'title', 'body', 'outro')
  expect(
    calls.filter((call) => call.name === 'register_agent').map((call) => call.args.harness)
  ).toEqual(['pi'])
})

it('keeps a transport failure a failure instead of retrying as an agent', async () => {
  callTool.mockImplementation(async (_fetch, _credential, name, args) => {
    record(name, args)
    if (name === 'register_agent') {
      throw new Error('offline')
    }
    return {}
  })
  await expect(client().createRequest('enzo', 'title', 'body', 'projeto')).rejects.toThrow(
    'offline'
  )
  expect(calls.filter((call) => call.name === 'register_agent')).toHaveLength(1)
})

it('leaves chat traffic in the inbox to the chat service', async () => {
  callTool.mockImplementation(async (_fetch, _credential, name, args) => {
    record(name, args)
    if (name === 'projects_list') {
      return { items: [{ id: 'projeto' }] }
    }
    if (name === 'inbox') {
      return {
        items: [
          { id: 'aaaaaaaaaaaaaaa', kind: 'chat', author_name: 'enzo', body: 'oi' },
          { id: 'bbbbbbbbbbbbbbb', kind: 'message', body: 'oi' },
          { id: 'ccccccccccccccc', kind: 'approval_pending', summary: 'Push' }
        ]
      }
    }
    return {}
  })
  const device = client()
  device.start()
  await vi.waitFor(() => expect(calls.some((call) => call.name === 'acknowledge')).toBe(true))
  device.stop()
  expect(notified.map((item) => item.id)).toEqual(['ccccccccccccccc'])
  expect(calls.find((call) => call.name === 'acknowledge')?.args.ids).toEqual(['ccccccccccccccc'])
})

it('invalidates chat only for chat/message SSE hints and reconnects', async () => {
  callTool.mockResolvedValue({})
  const changed = vi.fn()
  const device = new MegamindDeviceClient(
    'unused',
    true,
    sessionPath,
    () => true,
    () => {},
    changed
  )
  let hint: Parameters<typeof Gateway.startMegamindEvents>[2] = () => {}
  events.mockImplementation((_credential, _development, callback) => {
    hint = callback
  })
  device.start()
  await vi.waitFor(() => expect(events).toHaveBeenCalled())
  hint({ kind: 'priority_changed' })
  hint({ kind: 'approval_decision' })
  expect(changed).not.toHaveBeenCalled()
  hint({ kind: 'chat' })
  hint({ kind: 'message' })
  hint()
  expect(changed).toHaveBeenCalledTimes(3)
  device.stop()
  hint()
  expect(changed).toHaveBeenCalledTimes(3)
})
