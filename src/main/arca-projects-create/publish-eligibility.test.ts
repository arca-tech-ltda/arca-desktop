import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ git: vi.fn() }))
vi.mock('../git/runner', () => ({
  gitExecFileAsync: mocks.git,
  nonInteractiveGitEnv: () => ({})
}))
import { arcaPublishEligibility, arcaTypeFromPath } from './publish-eligibility'

function respond(responses: Record<string, string>): void {
  mocks.git.mockImplementation(async (args: string[]) => ({
    stdout: responses[args.join(' ')] ?? '',
    stderr: ''
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
})

it('offers a local folder that is not a repository yet', async () => {
  respond({})
  expect(await arcaPublishEligibility('/home/ana/code/meus-estudos', '/home/ana')).toEqual({
    eligible: true,
    suggestedName: 'meus-estudos',
    suggestedType: 'clientes',
    isGitRepo: false
  })
})

it('hides itself for a repository already in the ARCA org', async () => {
  respond({
    'rev-parse --is-inside-work-tree': 'true',
    'remote -v': 'origin git@github.com:arca-tech-ltda/isaro.git (fetch)'
  })
  expect(await arcaPublishEligibility('/home/ana/ARCA/clientes/isaro', '/home/ana')).toEqual({
    eligible: false,
    reason: 'already_arca'
  })
})

it('carries the foreign origin so the dialog can pick another remote name', async () => {
  respond({
    'rev-parse --is-inside-work-tree': 'true',
    'remote -v': 'origin git@github.com:ana/site.git (fetch)'
  })
  const eligibility = await arcaPublishEligibility('/home/ana/ARCA/produtos/site', '/home/ana')
  expect(eligibility).toMatchObject({
    eligible: true,
    suggestedType: 'produtos',
    originUrl: 'git@github.com:ana/site.git',
    isGitRepo: true
  })
})

it('reads the type from the ~/ARCA layout and defaults elsewhere', () => {
  expect(arcaTypeFromPath('/home/ana/ARCA/plataforma/mainframe', '/home/ana')).toBe('plataforma')
  expect(arcaTypeFromPath('/home/ana/code/x', '/home/ana')).toBe('clientes')
})
