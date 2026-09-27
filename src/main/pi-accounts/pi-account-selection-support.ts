/**
 * Does the installed Pi honour `PI_ACCOUNT_<PROVIDER>`?
 *
 * The answer defaults to "no": the UI shows the setting disabled and nothing is injected into a
 * PTY. `setPiAccountSelectionSupportProbe` is the single place to plug the real probe in. Pi can be
 * updated, downgraded or reinstalled while the app runs, so the answer is re-checked whenever it is
 * older than `SUPPORT_TTL_MS` — including on the spawn path, which reads it for every new terminal.
 */
export type PiAccountSelectionSupportProbe = () => boolean | Promise<boolean>

const DEV_OVERRIDE_ENV = 'ARCA_FORCE_PI_ACCOUNT_SUPPORT'
const SUPPORT_TTL_MS = 60_000

let probe: PiAccountSelectionSupportProbe | null = null
let cached: boolean | null = null
let checkedAt = 0
let inFlight: Promise<boolean> | null = null
const listeners = new Set<(supported: boolean) => void>()

export function setPiAccountSelectionSupportProbe(
  next: PiAccountSelectionSupportProbe | null
): void {
  probe = next
  cached = null
  checkedAt = 0
  inFlight = null
}

/** Fires when a re-check changes the answer, so the renderer state follows a Pi update. */
export function onPiAccountSelectionSupportChanged(
  listener: (supported: boolean) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function devOverride(): boolean {
  return process.env[DEV_OVERRIDE_ENV] === '1'
}

function publish(supported: boolean): void {
  const changed = cached !== supported
  cached = supported
  checkedAt = Date.now()
  if (changed) {
    for (const listener of listeners) {
      listener(supported)
    }
  }
}

function isStale(): boolean {
  return cached === null || Date.now() - checkedAt >= SUPPORT_TTL_MS
}

/**
 * Sync answer used on the PTY spawn path; never blocks a launch on a probe. A stale answer starts
 * the re-check in the background, so the following launch already sees the current Pi.
 */
export function isPiAccountSelectionSupported(): boolean {
  if (devOverride()) {
    return true
  }
  if (isStale()) {
    void refreshPiAccountSelectionSupport()
  }
  return cached === true
}

/** Tri-state read for the authority mode: `null` while the probe has not answered yet. */
export function getPiAccountSelectionSupportAnswer(): boolean | null {
  return devOverride() ? true : cached
}

export async function refreshPiAccountSelectionSupport(): Promise<boolean> {
  if (devOverride()) {
    return true
  }
  const current = probe
  if (!current) {
    publish(false)
    return false
  }
  // One probe at a time: a burst of terminals must not fork one `pi --arca-capabilities` each.
  inFlight ??= (async () => {
    try {
      return (await current()) === true
    } catch {
      return false
    }
  })().then((supported) => {
    inFlight = null
    publish(supported)
    return supported
  })
  return inFlight
}

export function resetPiAccountSelectionSupportForTest(): void {
  probe = null
  cached = null
  checkedAt = 0
  inFlight = null
  listeners.clear()
}
