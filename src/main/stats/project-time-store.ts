import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  creditProjectTime,
  retainProjectTime,
  type ProjectTimeTick,
  type ProjectTimeEntry
} from '../../shared/project-time'
import { StatsSnapshotWriter } from './stats-snapshot-writer'

export const projectTimeTickSchema = z.object({
  repoId: z.string().min(1).max(1024),
  displayName: z.string().min(1).max(1024),
  seconds: z.number().finite().positive(),
  endedAt: z.number().finite().optional()
})
const schema = z.array(
  z.object({
    repoId: z.string(),
    displayName: z.string(),
    days: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number().finite().nonnegative())
  })
)

export class ProjectTimeStore {
  private entries: ProjectTimeEntry[] = []
  private writer: StatsSnapshotWriter
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(file: string) {
    this.writer = new StatsSnapshotWriter(() => file)
    try {
      this.entries = schema.parse(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      // Missing or corrupt local history must not block startup.
    }
    this.entries = retainProjectTime(this.entries, new Date())
  }

  read(now = new Date()): ProjectTimeEntry[] {
    this.entries = retainProjectTime(this.entries, now)
    return this.entries
  }

  tick(tick: ProjectTimeTick, now = new Date()): void {
    const end =
      tick.endedAt === undefined
        ? now
        : new Date(Math.max(now.getTime() - 60_000, Math.min(now.getTime(), tick.endedAt)))
    this.entries = retainProjectTime(creditProjectTime(this.entries, tick, end), now)
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.flush().catch((error) => console.error('[project-time] Save failed:', error))
      }, 1000)
    }
  }

  flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    return this.writer.write(() => JSON.stringify(this.entries))
  }

  close(): void {
    clearTimeout(this.timer)
    this.writer.writeSync(() => JSON.stringify(this.entries))
  }
}
