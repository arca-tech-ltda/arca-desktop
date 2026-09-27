import { runProcess } from '../../shared/child-process/run-process'
import { buildLocalPreflightEnv } from '../ipc/preflight-local-env'

const PROBE_TIMEOUT_MS = 5_000

/**
 * Contract v1 §8: a patched Pi answers `pi --arca-capabilities` with JSON carrying
 * `"accountEnv": 1`. An unpatched Pi exits non-zero on the unknown option, which reads as
 * "no support" — the same answer as Pi not being installed at all.
 */
export async function probePiAccountEnvSupport(): Promise<boolean> {
  try {
    const result = await runProcess({
      program: process.platform === 'win32' ? 'pi.cmd' : 'pi',
      args: ['--arca-capabilities'],
      env: buildLocalPreflightEnv(),
      timeoutMs: PROBE_TIMEOUT_MS
    })
    if (result.code !== 0 || result.timedOut) {
      return false
    }
    const parsed: unknown = JSON.parse(result.stdout.trim())
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accountEnv' in parsed &&
      parsed.accountEnv === 1
    )
  } catch {
    return false
  }
}
