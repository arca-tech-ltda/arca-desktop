import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  scan: vi.fn(),
  add: vi.fn(),
  sync: vi.fn(),
  notify: vi.fn(),
  clone: vi.fn(),
  inspect: vi.fn(),
  space: vi.fn()
}))
vi.mock('electron', () => ({
  app: {},
  ipcMain: {},
  Notification: { isSupported: () => false },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../persistence', () => ({ Store: class {} }))
vi.mock('./catalog', () => ({ loadArcaCatalog: mocks.catalog }))
vi.mock('./disk', () => ({ scanArcaDisk: mocks.scan, hasArcaDiskSpace: mocks.space }))
vi.mock('./git-sync', () => ({ syncArcaGit: mocks.sync }))
vi.mock('./clone', () => ({
  cloneArcaProject: mocks.clone,
  inspectArcaCloneDestination: mocks.inspect,
  isCloneAccessError: (error: unknown) => String(error).includes('403')
}))
vi.mock('../ipc/repos/local-repo-registration', () => ({ addLocalRepoFromPath: mocks.add }))
vi.mock('../ipc/repos/repos-changed-notification', () => ({ notifyReposChanged: mocks.notify }))
vi.mock('../ipc/registered-worktree-roots-cache', () => ({
  invalidateAuthorizedRootsCache: vi.fn()
}))
import { Store } from '../persistence'
import { ArcaProjectsSync, shouldRunFocusedArcaSync } from './service'

const entry = {
  repoKey: 'github.com/dkelles/mcscala',
  name: 'mcscala',
  url: 'https://github.com/dkelles/mcscala.git',
  destination: '/home/ana/ARCA/clientes/mcdonalds-escalas',
  source: 'file'
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.space.mockResolvedValue(true)
  mocks.inspect.mockResolvedValue('missing')
})
it('coalesces runs, registers catalog repos only, and preserves the registration on repeated sync', async () => {
  mocks.catalog.mockResolvedValue({
    entries: [entry, { ...entry, repoKey: 'github.com/arca/new' }],
    sources: ['file'],
    errors: []
  })
  mocks.scan.mockResolvedValue([
    { repoKey: entry.repoKey, path: entry.destination },
    { repoKey: 'github.com/private/outside', path: '/outside' }
  ])
  mocks.add
    .mockResolvedValueOnce({ repo: { id: 'registered' }, alreadyExisted: false })
    .mockResolvedValue({ repo: { id: 'registered' }, alreadyExisted: true })
  mocks.sync.mockResolvedValue({ state: 'updated' })
  const service = new ArcaProjectsSync(new Store(), vi.fn())
  service.setAutoUpdate(false)
  const first = service.syncNow(false)
  expect(service.syncNow(false)).toBe(first)
  const status = await first
  expect(status.projects.map((row) => row.state)).toEqual(['updated', 'missing'])
  expect(status.outside).toEqual([{ repoKey: 'github.com/private/outside', path: '/outside' }])
  expect(mocks.add).toHaveBeenCalledTimes(1)
  expect((await service.syncNow(false)).projects[0].repoId).toBe('registered')
  expect(mocks.add.mock.calls.every(([, directory]) => directory === entry.destination)).toBe(true)
})
it('does not auto-register or report default-excluded catalog projects', async () => {
  mocks.catalog.mockResolvedValue({
    entries: [{ ...entry, name: 'brain', repoKey: 'github.com/arca-tech-ltda/brain' }],
    sources: ['mainframe'],
    errors: []
  })
  mocks.scan.mockResolvedValue([
    { repoKey: 'github.com/arca-tech-ltda/brain', path: '/home/ana/ARCA/plataforma/brain' }
  ])
  const status = await new ArcaProjectsSync(new Store(), vi.fn()).syncNow()
  expect(status.projects).toEqual([])
  expect(status.outside).toEqual([])
  expect(mocks.add).not.toHaveBeenCalled()
})
it('does not classify local repos outside an unavailable catalog', async () => {
  mocks.catalog.mockResolvedValue({ entries: [], sources: [], errors: ['offline'] })
  const service = new ArcaProjectsSync(new Store(), vi.fn())
  const status = await service.syncNow()
  expect(status.errors[0]).toContain('offline')
  expect(mocks.scan).not.toHaveBeenCalled()
  expect(mocks.add).not.toHaveBeenCalled()
})

it('clones missing projects automatically and registers them', async () => {
  mocks.catalog.mockResolvedValue({ entries: [entry], sources: ['file'], errors: [] })
  mocks.scan.mockResolvedValue([])
  mocks.clone.mockResolvedValue(undefined)
  mocks.add.mockResolvedValue({ repo: { id: 'new-repo' }, alreadyExisted: false })
  mocks.sync.mockResolvedValue({ state: 'updated', ahead: 0, behind: 0 })
  const status = await new ArcaProjectsSync(new Store(), vi.fn()).syncNow()
  expect(mocks.clone).toHaveBeenCalledWith(entry, expect.any(Function))
  expect(status.projects[0]).toMatchObject({ state: 'updated', repoId: 'new-repo' })
})

it('backs off inaccessible projects until a forced sync', async () => {
  mocks.catalog.mockResolvedValue({ entries: [entry], sources: ['file'], errors: [] })
  mocks.scan.mockResolvedValue([])
  mocks.clone.mockRejectedValue(new Error('remote returned 403'))
  const service = new ArcaProjectsSync(new Store(), vi.fn())
  expect((await service.syncNow()).projects[0].state).toBe('inaccessible')
  expect((await service.syncNow(false)).projects[0].state).toBe('inaccessible')
  expect(mocks.clone).toHaveBeenCalledTimes(1)
  expect((await service.syncNow()).projects[0].state).toBe('inaccessible')
  expect(mocks.clone).toHaveBeenCalledTimes(2)
})

it('pauses cloning when disk space is below the safety threshold', async () => {
  mocks.catalog.mockResolvedValue({ entries: [entry], sources: ['file'], errors: [] })
  mocks.scan.mockResolvedValue([])
  mocks.space.mockResolvedValue(false)
  const status = await new ArcaProjectsSync(new Store(), vi.fn()).syncNow()
  expect(status.projects[0].state).toBe('paused')
  expect(mocks.clone).not.toHaveBeenCalled()
})

it('throttles focus-triggered syncs for two minutes', () => {
  expect(shouldRunFocusedArcaSync(100_000, 219_999)).toBe(false)
  expect(shouldRunFocusedArcaSync(100_000, 220_000)).toBe(true)
})
