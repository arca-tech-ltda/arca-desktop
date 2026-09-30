import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as NodeOs from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let home = ''
let mode: 'pi' | 'managed' = 'pi'

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  homedir: () => home
}))
vi.mock('../ipc/preflight-command-exec', () => ({
  isCommandOnPath: async () => true
}))
vi.mock('../agent-authority/agent-authority-state', () => ({
  getAgentAuthorityMode: () => mode
}))

const { megamindPrerequisites } = await import('./prerequisites')

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

describe('megamindPrerequisites', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'megamind-prereq-'))
    mode = 'pi'
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('finds the Pi extension listed by absolute path in settings.json', async () => {
    const extension = join(home, 'ARCA', 'arca-chat', 'extensions', 'arca-megamind')
    mkdirSync(extension, { recursive: true })
    write(join(home, '.pi', 'agent', 'settings.json'), JSON.stringify({ extensions: [extension] }))
    expect(await megamindPrerequisites()).toMatchObject({ agent: true, piArcaMissing: false })
  })

  it('ignores a disabled or missing settings.json entry', async () => {
    write(
      join(home, '.pi', 'agent', 'settings.json'),
      JSON.stringify({
        extensions: ['-extensions/arca-megamind', join(home, 'gone', 'arca-megamind')]
      })
    )
    expect((await megamindPrerequisites()).agent).toBe(false)
  })

  it('reports Pi running without the ARCA Pi links, with the repo the command runs from', async () => {
    write(join(home, 'ARCA', 'arca', 'install.sh'), '#!/bin/bash\n')
    expect(await megamindPrerequisites()).toMatchObject({
      mode: 'pi',
      agent: false,
      piArcaMissing: true,
      installer: true,
      repoPath: join(home, 'ARCA', 'arca')
    })
  })

  it('in managed mode requires the MCP proxy, not Pi', async () => {
    mode = 'managed'
    expect(await megamindPrerequisites()).toMatchObject({
      mode: 'managed',
      agent: false,
      piArcaMissing: false
    })
    write(join(home, '.codex', 'config.toml'), '[mcp_servers.arca-megamind]\ncommand = "node"\n')
    expect((await megamindPrerequisites()).agent).toBe(true)
  })

  it('registers the MCP proxy itself in managed mode, so the check answers true unaided', async () => {
    mode = 'managed'
    const repo = join(home, 'ARCA', 'arca')
    write(join(repo, 'install.sh'), '#!/bin/bash\n')
    write(join(repo, 'bin', 'arca-megamind-mcp.mjs'), '// proxy\n')
    mkdirSync(join(repo, 'skills', 'arca-megamind'), { recursive: true })
    expect(await megamindPrerequisites()).toMatchObject({ agent: true, installer: true })
  })
})
