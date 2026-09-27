import { createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The env var the fase-A MCP proxy reads to know which Megamind session it speaks for. */
export const MEGAMIND_SESSION_ENV_KEY = 'ARCA_MEGAMIND_SESSION_ID'

let saltFilePath: string | null = null
let cachedSalt: Buffer | null = null

/** Point the salt at this profile's userData; call once during main startup. */
export function configureMegamindPaneSessionIdStore(userDataPath: string): void {
  const next = join(userDataPath, 'megamind-pane-session-salt')
  if (next !== saltFilePath) {
    saltFilePath = next
    cachedSalt = null
  }
}

export function resetMegamindPaneSessionIdStoreForTests(): void {
  saltFilePath = null
  cachedSalt = null
}

function readOrCreateSalt(): Buffer {
  if (cachedSalt) {
    return cachedSalt
  }
  const path = saltFilePath
  if (!path) {
    // Unconfigured (tests, early startup): a process-lifetime salt still gives one id per pane.
    cachedSalt = randomBytes(32)
    return cachedSalt
  }
  try {
    const stored = readFileSync(path, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(stored)) {
      cachedSalt = Buffer.from(stored, 'hex')
      return cachedSalt
    }
  } catch {
    /* First run on this profile. */
  }
  const salt = randomBytes(32)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${salt.toString('hex')}\n`, { mode: 0o600 })
  } catch {
    /* A read-only profile only costs stability across restarts. */
  }
  cachedSalt = salt
  return salt
}

/**
 * Stable session id for a pane: derived, not stored, so a PTY that outlives the app still maps to
 * the same Megamind session after a restart (the env inside the live shell cannot be rewritten).
 * Shaped as a v4 UUID because that is what the gateway contract accepts (§2.2).
 */
export function megamindPaneSessionId(paneKey: string): string {
  const digest = createHmac('sha256', readOrCreateSalt())
    .update(`megamind-pane:${paneKey}`)
    .digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
