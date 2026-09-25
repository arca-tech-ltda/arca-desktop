import { execFileSync } from 'node:child_process'
import type { WindowsHostInteractiveLoginSpawn } from '../../shared/windows-interactive-login-spawn'
import { admitSelfInitiatedTreeKill } from '../own-chromium-tree-kill-guard'
import type { CodexLoginChild } from './codex-login-session'

const WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS = 5_000

export function killCodexLoginProcessTree(
  child: CodexLoginChild,
  interactiveLogin?: WindowsHostInteractiveLoginSpawn | null
): void {
  const terminationPid = interactiveLogin?.getTerminationPid?.() ?? child.pid
  if (
    process.platform === 'win32' &&
    typeof terminationPid === 'number' &&
    child.exitCode === null &&
    child.signalCode === null &&
    // Last in the chain so a kill we never issue is never recorded, and a pid
    // Electron owns refuses here into the plain-signal fallback below.
    admitSelfInitiatedTreeKill({
      pid: terminationPid,
      site: 'codex-account-login-teardown',
      scope: 'win-taskkill-tree'
    })
  ) {
    try {
      // Why: child.kill() only reaches the direct child (cmd.exe for npm .cmd
      // shims); taskkill /t also ends codex descendants whose open handles on
      // the managed home make post-login file operations fail with ENOTEMPTY.
      execFileSync('taskkill', ['/pid', String(terminationPid), '/t', '/f'], {
        windowsHide: true,
        timeout: WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS,
        stdio: 'ignore'
      })
      return
    } catch {
      // Why: taskkill can race an already-exited tree; fall back to the plain
      // signal so the direct child never outlives its deadline.
    }
  }
  child.kill()
}
