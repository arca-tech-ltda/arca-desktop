import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectTimeStore, projectTimeTickSchema } from './project-time-store'

const dirs: string[] = []
function file() {
  const dir = mkdtempSync(join(tmpdir(), 'project-time-'))
  dirs.push(dir)
  return join(dir, 'project-time.json')
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('project time persistence', () => {
  it('starts empty for missing, corrupt and invalid files', async () => {
    const path = file()
    for (const content of [undefined, '{broken', '[{"repoId":4}]']) {
      if (content !== undefined) {
        writeFileSync(path, content)
      }
      const store = new ProjectTimeStore(path)
      expect(store.read()).toEqual([])
      await store.flush()
    }
  })
  it('persists buckets and the last name across reloads', async () => {
    const path = file()
    const store = new ProjectTimeStore(path)
    store.tick({ repoId: 'r', displayName: 'Saved name', seconds: 15 })
    await store.flush()
    expect(JSON.parse(readFileSync(path, 'utf8'))[0].displayName).toBe('Saved name')
    const reloaded = new ProjectTimeStore(path)
    expect(reloaded.read()).toEqual(store.read())
    await reloaded.flush()
  })
  it('keeps an idle cutoff before midnight in the previous day', async () => {
    const store = new ProjectTimeStore(file())
    const now = new Date(2026, 5, 15, 0, 0, 5)
    store.tick(
      { repoId: 'r', displayName: 'Repo', seconds: 10, endedAt: now.getTime() - 10_000 },
      now
    )
    expect(store.read(now)[0].days).toEqual({ '2026-06-14': 10 })
    await store.flush()
  })
  it('rejects malformed ticks', () => {
    expect(projectTimeTickSchema.safeParse({ repoId: '', seconds: Number.NaN }).success).toBe(false)
  })
})
