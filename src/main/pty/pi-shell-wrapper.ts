import { PI_EXTENSION_ENV_KEYS } from '../../shared/tui-agent-pi-extensions'

export function getPosixPiShellWrapper(): string {
  return `if [[ -n "\${ORCA_PI_EXT_TITLEBAR:-}\${ORCA_PI_EXT_PREFILL:-}\${ORCA_PI_EXT_STATUS:-}" ]]; then
function pi {
  local -a __orca_pi_extensions
  __orca_pi_extensions=()
  if [[ -n "\${ORCA_PANE_KEY:-}" ]]; then
${PI_EXTENSION_ENV_KEYS.map(
  (key) => `    if [[ -n "\${${key}:-}" && -f "$${key}" ]]; then
      __orca_pi_extensions+=(--extension "$${key}")
    fi`
).join('\n')}
  fi
  command pi "\${__orca_pi_extensions[@]}" "$@"
}
fi
`
}

export function getFishPiShellWrapper(): string {
  return `if set -q ORCA_PI_EXT_TITLEBAR; or set -q ORCA_PI_EXT_PREFILL; or set -q ORCA_PI_EXT_STATUS
function pi
  set -l __orca_pi_extensions
  if test -n "$ORCA_PANE_KEY"
${PI_EXTENSION_ENV_KEYS.map(
  (key) => `    if test -n "$${key}"; and test -f "$${key}"
      set -a __orca_pi_extensions --extension "$${key}"
    end`
).join('\n')}
  end
  command pi $__orca_pi_extensions $argv
end
end
`
}

export function getPowerShellPiShellWrapper(): string {
  return `if ($env:ORCA_PI_EXT_TITLEBAR -or $env:ORCA_PI_EXT_PREFILL -or $env:ORCA_PI_EXT_STATUS) {
function Global:pi {
    $orcaCommand = Get-Command pi -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $orcaCommand) { Write-Error "pi executable not found"; $global:LASTEXITCODE = 127; return }
    $orcaExtensions = @()
    if ($env:ORCA_PANE_KEY) {
${PI_EXTENSION_ENV_KEYS.map(
  (key) => `        if ($env:${key} -and (Test-Path -LiteralPath $env:${key} -PathType Leaf)) {
            $orcaExtensions += @('--extension', $env:${key})
        }`
).join('\n')}
    }
    & $orcaCommand.Source @orcaExtensions @args
    $global:LASTEXITCODE = $LASTEXITCODE
}
}
`
}
