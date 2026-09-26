import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { runProcess } from '../../../src/shared/child-process/run-process'

const extensionPath = resolve('tests/tools/pi-accounts-session/account-session-extension.mjs')
const preloadPath = resolve('tests/tools/pi-accounts-session/offline-preload.mjs')
const providers = ['anthropic', 'openai-codex']

function credential(provider, account) {
  return {
    type: 'oauth',
    access: `sk-ant-oat-synthetic-${provider}-${account}`,
    refresh: `synthetic-${provider}-${account}-refresh`,
    expires: Date.now() + 3_600_000,
    accountId: `synthetic-${account}`
  }
}

function safeEnvironment(root, runtimeDir, account) {
  const env = {}
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) {
    if (process.env[key]) {
      env[key] = process.env[key]
    }
  }
  return {
    ...env,
    HOME: join(root, 'home'),
    USERPROFILE: join(root, 'home'),
    XDG_CONFIG_HOME: join(root, 'home', 'config'),
    XDG_CACHE_HOME: join(root, 'home', 'cache'),
    XDG_DATA_HOME: join(root, 'home', 'data'),
    APPDATA: join(root, 'home', 'appdata'),
    LOCALAPPDATA: join(root, 'home', 'localappdata'),
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    PI_CODING_AGENT_DIR: join(root, 'agent'),
    CODEX_HOME: join(root, 'home', '.codex'),
    CLAUDE_CONFIG_DIR: join(root, 'home', '.claude'),
    PI_OFFLINE: '1',
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
    ORCA_BACKGROUND_LAUNCH: '1',
    PI_ACCOUNTS_ACCOUNT: account,
    PI_ACCOUNTS_REPORT_DIR: join(root, 'reports'),
    PI_ACCOUNTS_RUNTIME_DIR: runtimeDir
  }
}

it.skipIf(!process.env.PI_ACCOUNTS_RUNTIME_DIR)(
  'reproduces the public extension auth blocker with two CLIs sharing one unchanged auth.json',
  async () => {
    const runtimeDir = process.env.PI_ACCOUNTS_RUNTIME_DIR
    if (!runtimeDir) {
      throw new Error('Set PI_ACCOUNTS_RUNTIME_DIR to the installed Pi runtime package')
    }
    const cliScript = join(runtimeDir, 'dist', 'bundle', 'cli.js')
    if (!existsSync(cliScript)) {
      throw new Error(`Pi CLI not found: ${cliScript}`)
    }
    const root = await mkdtemp(join(tmpdir(), 'pi-accounts-session-'))
    try {
      const agent = join(root, 'agent')
      const reports = join(root, 'reports')
      for (const dir of [agent, reports, join(root, 'home'), join(root, 'A'), join(root, 'B')]) {
        await mkdir(dir, { recursive: true })
      }
      const authPath = join(agent, 'auth.json')
      const bucketPath = join(agent, 'accounts.json')
      const globals = Object.fromEntries(
        providers.map((provider) => [provider, credential(provider, 'GLOBAL')])
      )
      const bucket = {
        version: 1,
        active: {},
        accounts: Object.fromEntries(
          providers.map((provider) => [
            provider,
            Object.fromEntries(
              ['A', 'B'].map((account) => [account, credential(provider, account)])
            )
          ])
        )
      }
      await writeFile(authPath, `${JSON.stringify(globals, null, 2)}\n`, { mode: 0o600 })
      await writeFile(bucketPath, `${JSON.stringify(bucket, null, 2)}\n`, { mode: 0o600 })
      const authBefore = await readFile(authPath)
      const bucketBefore = await readFile(bucketPath)
      const results = await Promise.all(
        ['A', 'B'].map((account) =>
          runProcess({
            program: process.execPath,
            args: [
              '--import',
              pathToFileURL(preloadPath).href,
              cliScript,
              '--print',
              '--no-session',
              '--no-tools',
              '--no-extensions',
              '--no-skills',
              '--no-prompt-templates',
              '--no-themes',
              '--no-context-files',
              '--no-approve',
              '--extension',
              extensionPath
            ],
            cwd: join(root, account),
            env: safeEnvironment(root, runtimeDir, account),
            timeoutMs: 30_000,
            maxOutputBytes: 256 * 1024
          })
        )
      )
      expect(await readFile(authPath)).toEqual(authBefore)
      expect(await readFile(bucketPath)).toEqual(bucketBefore)
      for (const result of results) {
        expect(result.timedOut, result.stderr).toBe(false)
        expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0)
        expect(result.stderr).not.toContain('Extension error')
      }
      const records = await Promise.all(
        ['A', 'B'].map(async (account) =>
          JSON.parse(await readFile(join(reports, `${account}.json`), 'utf8'))
        )
      )
      expect(new Set(records.map((record) => record.pid)).size).toBe(2)
      for (const [index, record] of records.entries()) {
        expect(record.account).toBe(['A', 'B'][index])
        expect(record.agentDir).toBe(agent)
        expect(record.authPath).toBe(authPath)
        expect(record.results).toEqual(
          providers.map((provider) => ({
            provider,
            freshGlobalWins: true,
            withoutOAuthUnconfigured: true,
            refreshWritesSelectedToGlobalStore: true,
            explicitOverrideWorksForDirectCallerOnly: true
          }))
        )
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  60_000
)
