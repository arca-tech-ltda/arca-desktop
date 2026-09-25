import {
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from './tui-agent-startup-shell'

export const PI_EXTENSION_ENV_KEYS = [
  'ORCA_PI_EXT_TITLEBAR',
  'ORCA_PI_EXT_PREFILL',
  'ORCA_PI_EXT_STATUS'
] as const

// Called only on the execution host, after managed extension installation.
export function withPiManagedExtensions(
  command: string,
  shell: AgentStartupShell,
  env: Readonly<Record<string, string | undefined>>
): string {
  if (!env.ORCA_PANE_KEY) {
    return command
  }
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return command
  }
  const executable = parsed.tokens[0]?.split(/[\\/]/).at(-1)?.toLowerCase()
  const binary = executable?.replace(/\.(?:exe|cmd|bat)$/, '')
  if (binary !== 'pi' && binary !== 'prime-agent') {
    return command
  }
  const keys =
    binary === 'prime-agent' ? ['ORCA_PRIME_AGENT_STATUS_EXTENSION'] : PI_EXTENSION_ENV_KEYS
  const extensions = keys
    .flatMap((key) => {
      const path = env[key]
      if (
        !path ||
        parsed.tokens.some((token, i) => token === '--extension' && parsed.tokens[i + 1] === path)
      ) {
        return []
      }
      return [` --extension ${quoteStartupArg(path, shell)}`]
    })
    .join('')
  const end = parsed.spans[0].end
  return command.slice(0, end) + extensions + command.slice(end)
}
