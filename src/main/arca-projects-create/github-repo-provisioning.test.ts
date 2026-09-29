import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ gh: vi.fn() }))
vi.mock('../git/runner', () => ({ ghExecFileAsync: mocks.gh }))
import { ensureArcaRepository } from './github-repo-provisioning'

beforeEach(() => {
  vi.resetAllMocks()
})

it('creates a private repository with a README for a brand new project', async () => {
  mocks.gh.mockImplementation(async (args: string[]) => {
    if (args[1] === 'view') {
      throw new Error('GraphQL: Could not resolve to a Repository')
    }
    return { stdout: '', stderr: '' }
  })
  const result = await ensureArcaRepository({
    name: 'radar',
    description: 'Radar',
    addReadme: true
  })
  expect(result).toEqual({
    repo: 'arca-tech-ltda/radar',
    url: 'https://github.com/arca-tech-ltda/radar.git',
    created: true
  })
  expect(mocks.gh.mock.calls[1][0]).toEqual([
    'repo',
    'create',
    'arca-tech-ltda/radar',
    '--private',
    '--description',
    'Radar',
    '--add-readme'
  ])
})

it('does not recreate a repository a previous run already made', async () => {
  mocks.gh.mockResolvedValue({ stdout: '{"name":"radar"}', stderr: '' })
  const result = await ensureArcaRepository({ name: 'radar', description: '', addReadme: false })
  expect(result.created).toBe(false)
  expect(mocks.gh).toHaveBeenCalledTimes(1)
})

it('treats a racing "already exists" as success instead of failing the flow', async () => {
  mocks.gh.mockImplementation(async (args: string[]) => {
    if (args[1] === 'view') {
      throw new Error('404 not found')
    }
    throw new Error('Name already exists on this account')
  })
  await expect(
    ensureArcaRepository({ name: 'radar', description: '', addReadme: false })
  ).resolves.toMatchObject({ created: false })
})

it('surfaces an auth failure instead of trying to create', async () => {
  mocks.gh.mockRejectedValue(new Error('gh auth: you are not logged into any GitHub hosts'))
  await expect(
    ensureArcaRepository({ name: 'radar', description: '', addReadme: false })
  ).rejects.toThrow(/not logged into/)
  expect(mocks.gh).toHaveBeenCalledTimes(1)
})
