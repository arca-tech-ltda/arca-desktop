/**
 * Does the installed Pi honour `PI_ACCOUNT_<PROVIDER>`?
 *
 * The marker the patched Pi will publish is still being fixed in the `arca-pi` contract, so the
 * answer defaults to "no": the UI shows the setting disabled and nothing is injected into a PTY.
 * `setPiAccountSelectionSupportProbe` is the single place to plug the real probe in.
 */
export type PiAccountSelectionSupportProbe = () => boolean | Promise<boolean>

const DEV_OVERRIDE_ENV = 'ARCA_FORCE_PI_ACCOUNT_SUPPORT'

let probe: PiAccountSelectionSupportProbe | null = null
let cached: boolean | null = null

export function setPiAccountSelectionSupportProbe(
  next: PiAccountSelectionSupportProbe | null
): void {
  probe = next
  cached = null
}

function devOverride(): boolean {
  return process.env[DEV_OVERRIDE_ENV] === '1'
}

/** Sync answer used on the PTY spawn path; never blocks a launch on a probe. */
export function isPiAccountSelectionSupported(): boolean {
  return devOverride() || cached === true
}

export async function refreshPiAccountSelectionSupport(): Promise<boolean> {
  if (devOverride()) {
    return true
  }
  if (!probe) {
    cached = false
    return false
  }
  try {
    cached = (await probe()) === true
  } catch {
    cached = false
  }
  return cached
}

export function resetPiAccountSelectionSupportForTest(): void {
  probe = null
  cached = null
}
