/**
 * Wire shape and policy for the embedded ARCA Mainframe ("Megamind") panel. The page is a remote
 * web app, so every rule that decides what its guest may load lives here and is shared by the
 * main-process fences and the renderer panel.
 */

export const ARCA_MAINFRAME_DEFAULT_URL = 'https://mainframe.arcatech.com.br'

/** Persistent and dedicated: the Mainframe login must survive a restart without sharing a jar with user browsing. */
export const ARCA_MAINFRAME_PARTITION = 'persist:arca-mainframe'

export const ARCA_MAINFRAME_PANEL_PATH = 'megamind'

export const ARCA_MAINFRAME_ENDPOINT_CHANNEL = 'arcaMainframe:endpoint'

/** Main asks the renderer to reveal the panel (View menu). */
export const ARCA_MAINFRAME_SHOW_PANEL_CHANNEL = 'ui:showMegamindPanel'

export type ArcaMainframeEndpoint = {
  /** Scheme + host + port the guest is pinned to. */
  origin: string
  /** Page the panel loads. */
  panelUrl: string
}

/** What the renderer needs to attach the panel's guest; main owns every field. */
export type ArcaMainframePanelDescriptor = ArcaMainframeEndpoint & { partition: string }

/** Permissions a guest of this origin may hold; everything else is refused. */
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write'])

export function isAllowedArcaMainframePermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

function buildPanelUrl(base: URL): string {
  const basePath = base.pathname.replace(/\/+$/, '')
  const panel = new URL(`${basePath}/${ARCA_MAINFRAME_PANEL_PATH}`, base.origin)
  return panel.toString()
}

/**
 * Parse a configured base URL into the endpoint the panel loads, or null when it is not one this
 * app will embed. Plain http is admitted only for a loopback host in development.
 */
export function parseArcaMainframeBaseUrl(
  rawUrl: unknown,
  options: { allowInsecureLoopback?: boolean } = {}
): ArcaMainframeEndpoint | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (parsed.username || parsed.password || !parsed.hostname) {
    return null
  }
  if (parsed.protocol === 'http:') {
    if (!options.allowInsecureLoopback || !isLoopbackHostname(parsed.hostname)) {
      return null
    }
  } else if (parsed.protocol !== 'https:') {
    return null
  }
  return { origin: parsed.origin, panelUrl: buildPanelUrl(parsed) }
}

/**
 * The endpoint the app embeds: `ARCA_MAINFRAME_URL` when it is admissible, otherwise the shipped
 * default. A rejected override never degrades into "no panel", so a typo cannot lock the user out.
 */
export function resolveArcaMainframeEndpoint(
  configuredUrl: unknown,
  options: { allowInsecureLoopback?: boolean } = {}
): ArcaMainframeEndpoint {
  const configured = parseArcaMainframeBaseUrl(configuredUrl, options)
  if (configured) {
    return configured
  }
  const fallback = parseArcaMainframeBaseUrl(ARCA_MAINFRAME_DEFAULT_URL)
  if (!fallback) {
    throw new Error('arca_mainframe_default_url_invalid')
  }
  return fallback
}

/**
 * `internal` stays in the guest, `external` is handed to the system browser, `block` is dropped.
 * Only http(s) ever leaves, so a `javascript:`/`file:`/custom-scheme target cannot be routed out.
 */
export type ArcaMainframeNavigationDecision = 'internal' | 'external' | 'block'

export function classifyArcaMainframeNavigation(
  origin: string,
  rawUrl: string
): ArcaMainframeNavigationDecision {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'block'
  }
  if (parsed.origin === origin) {
    return 'internal'
  }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? 'external' : 'block'
}
