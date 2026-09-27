import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  configureMegamindPaneSessionIdStore,
  megamindPaneSessionId,
  MEGAMIND_SESSION_ENV_KEY,
  resetMegamindPaneSessionIdStoreForTests
} from './megamind-pane-session-id'
import { applyMegamindSessionPtyEnv } from './megamind-session-pty-env'

const PANE = `tab-1:${randomUUID()}`
const OTHER_PANE = `tab-1:${randomUUID()}`
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'megamind-session-env-'))
  configureMegamindPaneSessionIdStore(dir)
})

afterEach(() => {
  resetMegamindPaneSessionIdStoreForTests()
  rmSync(dir, { recursive: true, force: true })
})

it('injects one stable uuid per pane on a local spawn', () => {
  const env: Record<string, string> = { PATH: '/usr/bin' }
  applyMegamindSessionPtyEnv(env, { paneKey: PANE, cwd: '/tmp/repo' })
  const id = env[MEGAMIND_SESSION_ENV_KEY]
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

  const again: Record<string, string> = {}
  applyMegamindSessionPtyEnv(again, { paneKey: PANE, cwd: '/tmp/other' })
  expect(again[MEGAMIND_SESSION_ENV_KEY]).toBe(id)

  const other: Record<string, string> = {}
  applyMegamindSessionPtyEnv(other, { paneKey: OTHER_PANE, cwd: '/tmp/repo' })
  expect(other[MEGAMIND_SESSION_ENV_KEY]).not.toBe(id)
})

it('keeps the same id for a pane after the app restarts', () => {
  const first = megamindPaneSessionId(PANE)
  resetMegamindPaneSessionIdStoreForTests()
  configureMegamindPaneSessionIdStore(dir)
  expect(megamindPaneSessionId(PANE)).toBe(first)
})

it('never injects on SSH or WSL, and strips an id already in the env', () => {
  for (const remote of [
    { connectionId: 'ssh-1' },
    { isWsl: true },
    { cwd: '\\\\wsl$\\Ubuntu\\home\\bi\\repo' }
  ]) {
    const env: Record<string, string> = {
      [MEGAMIND_SESSION_ENV_KEY]: 'stale',
      PATH: '/usr/bin'
    }
    applyMegamindSessionPtyEnv(env, { paneKey: PANE, cwd: '/tmp/repo', ...remote })
    expect(env).toEqual({ PATH: '/usr/bin' })
  }
})

it('never injects without a valid pane key', () => {
  const env: Record<string, string> = {}
  applyMegamindSessionPtyEnv(env, { paneKey: null, cwd: '/tmp/repo' })
  applyMegamindSessionPtyEnv(env, { paneKey: '12', cwd: '/tmp/repo' })
  expect(env).toEqual({})
})
