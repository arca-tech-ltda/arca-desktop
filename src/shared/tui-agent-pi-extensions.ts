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

// Resolve on the execution host, never embed desktop paths in SSH commands.
export function withPiManagedExtensions(command: string, shell: AgentStartupShell): string {
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return command
  }
  const executable = parsed.tokens[0]?.split(/[\\/]/).at(-1)?.toLowerCase()
  const binary = executable?.replace(/\.(?:exe|cmd|bat)$/, '')
  if (binary !== 'pi' && binary !== 'prime-agent') {
    return command
  }
  const end = parsed.spans[0].end
  const keys =
    binary === 'prime-agent' ? ['ORCA_PRIME_AGENT_STATUS_EXTENSION'] : PI_EXTENSION_ENV_KEYS
  const refs = keys.map((key) =>
    shell === 'cmd' ? `"%${key}%"` : shell === 'powershell' ? `"$env:${key}"` : `"$${key}"`
  )
  const extended =
    command.slice(0, end) + refs.map((ref) => ` --extension ${ref}`).join('') + command.slice(end)
  if (shell === 'powershell') {
    const available = refs
      .map((ref) => `(Test-Path -LiteralPath ${ref} -PathType Leaf)`)
      .join(' -and ')
    return `if ($env:ORCA_PANE_KEY -and ${available}) { ${extended} } else { ${command} }`
  }
  if (shell === 'cmd') {
    return `if defined ORCA_PANE_KEY (${refs.reduceRight((next, ref) => `if exist ${ref} (${next}) else (${command})`, extended)}) else (${command})`
  }
  const available = ['test -n "$ORCA_PANE_KEY"', ...refs.map((ref) => `test -f ${ref}`)].join(
    ' && '
  )
  const script = `if ${available}; then ${extended}; else ${command}; fi`
  return `sh -c ${quoteStartupArg(script, 'posix')}`
}
