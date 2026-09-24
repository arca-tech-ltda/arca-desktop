import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hostname } from 'node:os'
import { object, readCredential, type DeviceCredential } from './credentials'
import { callTool, records, startMegamindEvents } from './gateway'
import type { MegamindRecord } from '../../shared/arca-megamind'

export class MegamindDeviceClient {
  private credential?: DeviceCredential
  private sessions = new Map<string, string>()
  private timer?: ReturnType<typeof setTimeout>
  private closeEvents?: () => void
  private running = false
  private busy = false
  private delay = 60_000
  private loaded?: Promise<void>
  private registering = new Map<string, Promise<string>>()
  constructor(
    private readonly path: string,
    private readonly development: boolean,
    private readonly sessionPath: string,
    private readonly notify: (item: MegamindRecord) => boolean,
    private readonly connectionChanged: (connected: boolean) => void
  ) {}

  private loadSessions(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const value: unknown = JSON.parse(await readFile(this.sessionPath, 'utf8'))
        if (object(value)) {
          for (const [project, id] of Object.entries(value)) {
            if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) {
              this.sessions.set(project, id)
            }
          }
        }
      } catch {
        /* A new profile has no Desktop sessions yet. */
      }
    })()
    return this.loaded
  }

  async agents(): Promise<MegamindRecord[]> {
    await this.loadSessions()
    const desktopSessions = new Set(this.sessions.values())
    return records(await this.tool('list_agents', {}))
      .filter(
        (agent) => typeof agent.session_id === 'string' && !desktopSessions.has(agent.session_id)
      )
      .map((agent) => ({ ...agent, id: agent.session_id }))
  }
  priorities(): Promise<MegamindRecord> {
    return this.tool('priorities_list', {})
  }
  async requests(): Promise<MegamindRecord[]> {
    await this.loadSessions()
    const result: MegamindRecord[] = []
    for (const session_id of this.sessions.values()) {
      result.push(...records(await this.tool('requests_list', { session_id, box: 'inbox' })))
    }
    return result
  }
  private async tool(name: string, args: MegamindRecord): Promise<MegamindRecord> {
    this.credential ??= await readCredential(this.path, this.development)
    return callTool(fetch, this.credential, name, args)
  }
  private session(project: string): Promise<string> {
    const existing = this.registering.get(project)
    if (existing) {
      return existing
    }
    const pending = this.registerSession(project).finally(() => this.registering.delete(project))
    this.registering.set(project, pending)
    return pending
  }
  private async registerSession(project: string): Promise<string> {
    await this.loadSessions()
    let id = this.sessions.get(project)
    if (!id) {
      id = randomUUID()
      this.sessions.set(project, id)
      await mkdir(dirname(this.sessionPath), { recursive: true })
      await writeFile(this.sessionPath, JSON.stringify(Object.fromEntries(this.sessions)), {
        mode: 0o600
      })
    }
    // The gateway requires an owned session even for device/actor inbox readers.
    await this.tool('register_agent', {
      session_id: id,
      project_id: project,
      harness: 'pi',
      label: `${hostname()} ARCA Desktop`.slice(0, 80),
      note: 'Desktop inbox; no agent execution'
    })
    return id
  }
  async createRequest(to: string, title: string, body: string, projectId: string): Promise<void> {
    const from_session = await this.session(projectId)
    await this.tool('request_create', {
      from_session,
      to,
      title,
      body,
      project_id: projectId,
      request_id: randomUUID()
    })
  }
  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    void this.poll()
  }
  private async poll(): Promise<void> {
    if (!this.running || this.busy) {
      return
    }
    this.busy = true
    clearTimeout(this.timer)
    try {
      const projects = records(await this.tool('projects_list', {}))
      // One inbox session receives device/actor requests; explicit sessions serve delegated projects.
      const first = projects.find((project) => typeof project.id === 'string')
      if (first && typeof first.id === 'string') {
        await this.session(first.id)
      }
      for (const session_id of this.sessions.values()) {
        const items = records(await this.tool('inbox', { session_id, limit: 50 }))
        const ids: string[] = []
        for (const item of items) {
          if (typeof item.id !== 'string' || !/^[a-z0-9]{15}$/.test(item.id)) {
            continue
          }
          if (item.kind === 'message') {
            continue
          }
          if (this.notify(item)) {
            ids.push(item.id)
          }
        }
        if (ids.length) {
          await this.tool('acknowledge', { session_id, ids })
        }
      }
      if (!this.closeEvents && this.credential && this.running) {
        this.closeEvents = startMegamindEvents(this.credential, this.development, (event) => {
          if (
            event?.kind === 'approval_decision' ||
            (typeof event?.kind === 'string' && event.kind.toLowerCase().includes('priority'))
          ) {
            this.notify(event)
          }
          void this.poll()
        })
      }
      if (this.running) {
        this.connectionChanged(true)
      }
      this.delay = 60_000
    } catch {
      if (this.running) {
        this.connectionChanged(false)
      }
      this.credential = undefined
      this.delay = Math.min(this.delay * 2, 300_000)
    } finally {
      this.busy = false
      if (this.running) {
        this.timer = setTimeout(() => void this.poll(), this.delay)
        this.timer.unref()
      }
    }
  }
  stop(): void {
    this.running = false
    clearTimeout(this.timer)
    this.closeEvents?.()
  }
}
