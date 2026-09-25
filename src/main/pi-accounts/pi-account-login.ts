import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CODEX_LOGIN_CANCELLED_MESSAGE } from '../../shared/codex-auth-errors'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import { captureClaudeAuthFromConfigDir } from '../claude-accounts/claude-auth-capture'
import { runClaudeCommandProcess } from '../claude-accounts/claude-command-process'
import { runClaudeLoginSession } from '../claude-accounts/claude-login-session'
import { killCodexLoginProcessTree } from '../codex-accounts/codex-login-process-teardown'
import { runCodexLoginSession } from '../codex-accounts/codex-login-session'
import {
  convertClaudeCredentialsToPiAccount,
  convertCodexAuthToPiAccount,
  type PiCapturedAccount
} from './credential-conversion'

export const PI_LOGIN_CANCELLED_MESSAGES = [
  'Claude sign-in was cancelled.',
  CODEX_LOGIN_CANCELLED_MESSAGE
]

export type PiLoginHooks = {
  /** Registers the handle that abandons this login; called with null once it settles. */
  setCancel: (cancel: (() => boolean) | null) => void
  /** Codex prints a browser link; publish it so a headless-ish desktop can still finish. */
  onAuthUrl?: (url: string | null) => void
}

export type PiLoginRunner = (hooks: PiLoginHooks) => Promise<PiCapturedAccount>

export function isPiLoginCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return PI_LOGIN_CANCELLED_MESSAGES.includes(message.trim())
}

/** Drives `claude auth login` in a throwaway config dir and converts what it captured. */
export async function runPiClaudeLogin(hooks: PiLoginHooks): Promise<PiCapturedAccount> {
  // The session owns the temporary CLAUDE_CONFIG_DIR and the Keychain item it creates: both are
  // removed before it returns, so the only copy of the token left is the one we convert here.
  const captured = await runClaudeLoginSession(
    {
      managedAuthPath: '',
      managedAuthRuntime: 'host',
      wslDistro: null,
      wslLinuxAuthPath: null
    },
    {
      runCommand: (args, config, timeoutMs, options) =>
        runClaudeCommandProcess(args, config, timeoutMs, options),
      capture: (configDir, status, previousLegacy) =>
        captureClaudeAuthFromConfigDir(configDir, status, previousLegacy),
      setCancel: hooks.setCancel
    }
  )
  return convertClaudeCredentialsToPiAccount(captured.credentialsJson, {
    email: captured.identity.email,
    organizationUuid: captured.identity.organizationUuid
  })
}

/** Drives `codex login` in a throwaway CODEX_HOME and converts the auth.json it wrote. */
export async function runPiCodexLogin(hooks: PiLoginHooks): Promise<PiCapturedAccount> {
  const home = await mkdtemp(join(tmpdir(), 'arca-pi-codex-login-'))
  try {
    await runCodexLoginSession(home, {
      wslCommand: 'wsl.exe',
      spawn: ({ command, args, env, stdio }) =>
        // Hide the outer wrapper only; a dedicated login console stays visible.
        spawn(command, args, { stdio, windowsHide: true, env }),
      killProcessTree: killCodexLoginProcessTree,
      setCancel: hooks.setCancel,
      onAuthUrl: (url) => hooks.onAuthUrl?.(url)
    })
    return convertCodexAuthToPiAccount(await readFile(join(home, 'auth.json'), 'utf8'))
  } finally {
    hooks.setCancel(null)
    hooks.onAuthUrl?.(null)
    await rm(home, { recursive: true, force: true }).catch(() => {})
  }
}

export function getPiLoginRunner(provider: PiAccountProvider): PiLoginRunner {
  return provider === 'anthropic' ? runPiClaudeLogin : runPiCodexLogin
}
