/** Public macOS shell command. The bundled `orca` launcher stays beside it for internal callers. */
export const MAC_CLI_COMMAND_NAME = 'arca'
export const DEFAULT_MAC_COMMAND_PATH = `/usr/local/bin/${MAC_CLI_COMMAND_NAME}`
export const DEV_COMMAND_NAME = 'orca-dev'
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
