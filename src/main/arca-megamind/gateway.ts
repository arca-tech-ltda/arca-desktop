import type { DeviceCredential } from './credentials'
import { object, safeMegamindUrl } from './credentials'
import type { MegamindRecord } from '../../shared/arca-megamind'

export type Fetch = typeof fetch

export async function megamindJson(
  fetcher: Fetch,
  url: string,
  body?: unknown,
  token?: string
): Promise<MegamindRecord> {
  const response = await fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    throw new Error(`Megamind HTTP ${response.status}`)
  }
  if (!response.body) {
    throw new Error('Empty Megamind response')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      size += next.value.byteLength
      if (size > 4 * 1024 * 1024) {
        throw new Error('Megamind response too large')
      }
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!object(value)) {
    throw new Error('Invalid Megamind response')
  }
  return value
}

export async function callTool(
  fetcher: Fetch,
  credential: DeviceCredential,
  name: string,
  args: MegamindRecord
): Promise<MegamindRecord> {
  const rpc = await megamindJson(
    fetcher,
    credential.endpoint,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    },
    credential.token
  )
  if (rpc.error || !object(rpc.result) || rpc.result.isError) {
    throw new Error('Megamind tool failed')
  }
  const content = rpc.result.content
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!object(part) || typeof part.text !== 'string') {
        continue
      }
      const value: unknown = JSON.parse(part.text)
      if (object(value)) {
        return value
      }
    }
  }
  return rpc.result
}

export function records(result: MegamindRecord): MegamindRecord[] {
  return Array.isArray(result.items) ? result.items.filter(object) : []
}

export function startMegamindEvents(
  credential: DeviceCredential,
  development: boolean,
  changed: (event?: MegamindRecord) => void,
  fetcher: Fetch = fetch
): () => void {
  const url = safeMegamindUrl(new URL('/api/arca/events', credential.endpoint).href, development)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let delay = 1000
  async function connect(): Promise<void> {
    controller = new AbortController()
    const started = Date.now()
    try {
      const response = await fetcher(url, {
        redirect: 'error',
        headers: { Authorization: `Bearer ${credential.token}`, Accept: 'text/event-stream' },
        signal: controller.signal
      })
      if (!response.ok || !response.body) {
        throw new Error('Events unavailable')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      changed()
      try {
        while (!stopped) {
          const next = await reader.read()
          if (next.done) {
            break
          }
          buffer += decoder.decode(next.value, { stream: true })
          if (buffer.length > 65536) {
            throw new Error('Event too large')
          }
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const data = frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n')
            if (!data) {
              continue
            }
            try {
              const event: unknown = JSON.parse(data)
              if (
                object(event) &&
                typeof event.kind === 'string' &&
                typeof event.id === 'string' &&
                /^[a-z0-9]{15}$/.test(event.id)
              ) {
                changed(event)
              }
            } catch {
              /* Malformed hints never replace the inbox poll. */
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    } catch {
      /* Polling remains authoritative when SSE is unavailable. */
    } finally {
      controller.abort()
      if (Date.now() - started > 10_000) {
        delay = 1000
      }
      if (!stopped) {
        timer = setTimeout(() => void connect(), delay)
        timer.unref()
        delay = Math.min(delay * 2, 60_000)
      }
    }
  }
  void connect()
  return () => {
    stopped = true
    clearTimeout(timer)
    controller?.abort()
  }
}
