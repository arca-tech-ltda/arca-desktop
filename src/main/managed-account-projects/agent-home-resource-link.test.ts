import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { linkAgentHomeResource, unlinkAgentHomeResourceLinks } from './agent-home-resource-link'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function workspace(): { realHome: string; managedHome: string } {
  const root = mkdtempSync(join(tmpdir(), 'agent-home-link-'))
  dirs.push(root)
  const realHome = join(root, 'home', '.claude')
  mkdirSync(join(realHome, 'skills', 'arca-megamind'), { recursive: true })
  writeFileSync(join(realHome, 'skills', 'arca-megamind', 'SKILL.md'), '# do usuário\n')
  writeFileSync(join(realHome, 'CLAUDE.md'), '# instruções do usuário\n')
  const managedHome = join(root, 'managed', 'conta-1')
  mkdirSync(managedHome, { recursive: true })
  return { realHome, managedHome }
}

it('severs the links without touching what they point at', () => {
  const { realHome, managedHome } = workspace()
  linkAgentHomeResource(join(realHome, 'skills'), join(managedHome, 'skills'))
  linkAgentHomeResource(join(realHome, 'CLAUDE.md'), join(managedHome, 'CLAUDE.md'))
  writeFileSync(join(managedHome, 'auth.json'), '{}')

  unlinkAgentHomeResourceLinks(managedHome)
  rmSync(managedHome, { recursive: true, force: true })

  expect(existsSync(managedHome)).toBe(false)
  expect(readFileSync(join(realHome, 'skills', 'arca-megamind', 'SKILL.md'), 'utf-8')).toBe(
    '# do usuário\n'
  )
  expect(readFileSync(join(realHome, 'CLAUDE.md'), 'utf-8')).toBe('# instruções do usuário\n')
})

it('reaches a link nested under a real directory of the managed home', () => {
  const { realHome, managedHome } = workspace()
  mkdirSync(join(managedHome, 'skills'), { recursive: true })
  symlinkSync(join(realHome, 'skills', 'arca-megamind'), join(managedHome, 'skills', 'arca'))

  unlinkAgentHomeResourceLinks(managedHome)
  rmSync(managedHome, { recursive: true, force: true })

  expect(existsSync(join(realHome, 'skills', 'arca-megamind', 'SKILL.md'))).toBe(true)
})

it('does nothing for a home that is not there', () => {
  expect(() => unlinkAgentHomeResourceLinks(join(tmpdir(), 'nao-existe-arca'))).not.toThrow()
})
