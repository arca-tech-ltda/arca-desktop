import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as WorktreeAgentDetection from './worktree-agent-detection'

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  realpathNative: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
  tmpdir: vi.fn(() => 'C:\\Users\\GABRIE~1\\AppData\\Local\\Temp')
}))
vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
  realpathSync: Object.assign(vi.fn(), { native: mocks.realpathNative }),
  statSync: mocks.statSync
}))
vi.mock('node:os', () => ({ tmpdir: mocks.tmpdir }))

const SHORT_TEMP = 'C:\\Users\\GABRIE~1\\AppData\\Local\\Temp'
const LONG_TEMP = 'C:\\Users\\Gabriel Mendonça\\AppData\\Local\\Temp'
const realPlatform = process.platform

async function loadModule(): Promise<typeof WorktreeAgentDetection> {
  vi.resetModules()
  return import('./worktree-agent-detection')
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  process.env.TEMP = SHORT_TEMP
  process.env.TMP = SHORT_TEMP
  mocks.realpathNative.mockReset()
  mocks.realpathNative.mockImplementation((path: string) => path.replace(SHORT_TEMP, LONG_TEMP))
  // Linked worktree with no agent marker: only the temp-root heuristic can classify it.
  mocks.readFileSync.mockImplementation((path: string) => {
    if (path.endsWith('\\.git')) {
      return `gitdir: ${path.replace('\\.git', '\\..\\.git\\worktrees\\wt')}\n`
    }
    throw new Error('missing marker')
  })
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  delete process.env.TEMP
  delete process.env.TMP
})

describe('Windows short (8.3) temp paths', () => {
  it('lists both the 8.3 spelling and its real path as temp roots', async () => {
    const { listAgentWorktreeTempRoots } = await loadModule()
    expect(listAgentWorktreeTempRoots()).toEqual([SHORT_TEMP, LONG_TEMP])
  })

  it('keeps the raw spelling when the real path cannot be resolved', async () => {
    mocks.realpathNative.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const { listAgentWorktreeTempRoots } = await loadModule()
    expect(listAgentWorktreeTempRoots()).toEqual([SHORT_TEMP])
  })

  it('detects a worktree whose real path lands under the temp root', async () => {
    const { detectAgentWorktree } = await loadModule()
    expect(detectAgentWorktree(`${SHORT_TEMP}\\arca-agent-1\\wt`, [LONG_TEMP])).toMatchObject({
      source: 'temp-dir'
    })
  })

  it('detects a long-form worktree against an 8.3 temp root', async () => {
    const { detectAgentWorktree } = await loadModule()
    expect(
      detectAgentWorktree(`${LONG_TEMP}\\arca-agent-1\\wt`, listRootsFor(SHORT_TEMP))
    ).toMatchObject({ source: 'temp-dir' })
  })

  it('leaves a worktree outside every temp root unclassified', async () => {
    const { detectAgentWorktree } = await loadModule()
    expect(detectAgentWorktree('C:\\work\\repo-wt', [LONG_TEMP])).toBeUndefined()
  })
})

function listRootsFor(root: string): string[] {
  return [root, mocks.realpathNative(root)]
}
