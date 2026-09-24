import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { gitExecFileAsync } from '../git/runner'
import { scanArcaDisk } from './disk'

const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})
it('scans two levels and central repo, matching origin rather than folder name', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'arca-sync-'))
  homes.push(home)
  for (const relative of [
    'clientes/mcdonalds-escalas',
    'produtos/group',
    'produtos/group/desktop',
    'arca',
    'plataforma/a/b/too-deep'
  ]) {
    const cwd = path.join(home, 'ARCA', relative)
    await mkdir(cwd, { recursive: true })
    await gitExecFileAsync(['init'], { cwd })
    await gitExecFileAsync(
      ['remote', 'add', 'origin', `git@github.com:DKelles/${path.basename(relative)}.git`],
      { cwd }
    )
  }
  const repos = await scanArcaDisk(home)
  expect(repos.map((repo) => repo.repoKey).sort()).toEqual([
    'github.com/dkelles/arca',
    'github.com/dkelles/desktop',
    'github.com/dkelles/group',
    'github.com/dkelles/mcdonalds-escalas'
  ])
})
