import { win32 } from 'node:path'
import { tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'
import { withPiManagedExtensions } from '../../shared/tui-agent-pi-extensions'

export function piLaunchCommand(
  command: string | undefined,
  shellPath: string | undefined,
  env: Readonly<Record<string, string | undefined>>
): string | undefined {
  if (!command) {
    return command
  }
  const shell = win32
    .basename(
      shellPath ??
        (process.platform === 'win32'
          ? (env.ORCA_TERMINAL_WINDOWS_SHELL ?? 'powershell.exe')
          : (env.SHELL ?? 'sh'))
    )
    .toLowerCase()
    .replace(/\.exe$/, '')
  const dialect =
    shell === 'cmd' ? 'cmd' : /^(?:powershell|pwsh)$/.test(shell) ? 'powershell' : 'posix'
  const parsed = tokenizeStartupCommand(command, dialect)
  // The canonical shell function injects each available extension on supported shells.
  if (
    parsed.ok &&
    parsed.tokens[0] === 'pi' &&
    (dialect === 'powershell' || ['bash', 'zsh', 'fish', 'wsl'].includes(shell))
  ) {
    return command
  }
  return withPiManagedExtensions(command, dialect, env)
}
