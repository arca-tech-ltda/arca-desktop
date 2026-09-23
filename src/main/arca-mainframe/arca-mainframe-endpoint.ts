import { is } from '@electron-toolkit/utils'
import {
  resolveArcaMainframeEndpoint,
  type ArcaMainframeEndpoint
} from '../../shared/arca-mainframe'

let cached: ArcaMainframeEndpoint | null = null

/**
 * The Mainframe endpoint this process embeds. Resolved once: the guest's admission rule, its
 * navigation fence and the renderer's panel URL must all name the same origin for the life of
 * the process, so a mid-session env change cannot split them.
 */
export function getArcaMainframeEndpoint(): ArcaMainframeEndpoint {
  cached ??= resolveArcaMainframeEndpoint(process.env.ARCA_MAINFRAME_URL, {
    allowInsecureLoopback: is.dev
  })
  return cached
}
