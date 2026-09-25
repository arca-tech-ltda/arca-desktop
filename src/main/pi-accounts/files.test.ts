import type * as FileSystem from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJson } from './files'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystem>()
  return { ...original, rename: vi.fn(original.rename) }
})
afterEach(() => vi.mocked(rename).mockClear())

it.each(['EPERM', 'EBUSY'])('retries %s without deleting the destination', async (code) => {
  const home = await mkdtemp(join(tmpdir(), 'pi-atomic-'))
  try {
    const path = join(home, 'state.json')
    await writeJson(path, { old: true })
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked'), { code }))
    await writeJson(path, { next: true })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ next: true })
    expect(await readdir(home)).toEqual(['state.json'])
    expect(rename).toHaveBeenCalledTimes(3)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('keeps original contents and removes temporary files after permanent failure', async () => {
  const home = await mkdtemp(join(tmpdir(), 'pi-atomic-'))
  try {
    const path = join(home, 'state.json')
    await writeJson(path, { old: true })
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
    await expect(writeJson(path, { next: true })).rejects.toThrow('denied')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ old: true })
    expect(await readdir(home)).toEqual(['state.json'])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
