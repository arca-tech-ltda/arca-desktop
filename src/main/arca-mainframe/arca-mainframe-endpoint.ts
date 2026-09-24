import { is } from '@electron-toolkit/utils'
import { readFileSync } from 'node:fs'
import { megamindConfigPath, object, safeMegamindUrl } from '../arca-megamind/credentials'
import {
  resolveArcaMainframeEndpoint,
  type ArcaMainframeEndpoint
} from '../../shared/arca-mainframe'

let cached: ArcaMainframeEndpoint | null = null

function configuredMegamindOrigin(): string | undefined {
  try {
    const config: unknown = JSON.parse(readFileSync(megamindConfigPath(), 'utf8'))
    if (object(config) && typeof config.endpoint === 'string') {
      return safeMegamindUrl(config.endpoint, is.dev).origin
    }
  } catch {
    // An absent or invalid config must not prevent opening the login panel.
  }
  return undefined
}

/**
 * The Mainframe endpoint this process embeds. Resolved once: the guest's admission rule, its
 * navigation fence and the renderer's panel URL must all name the same origin for the life of
 * the process, so a mid-session env change cannot split them.
 */
export function getArcaMainframeEndpoint(): ArcaMainframeEndpoint {
  cached ??= resolveArcaMainframeEndpoint(
    process.env.ARCA_MAINFRAME_URL ?? configuredMegamindOrigin(),
    {
      allowInsecureLoopback: is.dev
    }
  )
  return cached
}
