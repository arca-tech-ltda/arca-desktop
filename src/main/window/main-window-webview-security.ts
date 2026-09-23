import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { ORCA_BROWSER_GUEST_WEB_PREFERENCES } from '../../shared/browser-guest-web-preferences'
import { normalizeBrowserNavigationUrl } from '../../shared/browser-url'
import { browserManager } from '../browser/browser-manager'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import {
  enforceLocalSshWebRtcPolicyForGuest,
  isLocalSshBrowserPartition
} from '../browser/local-ssh-browser-partitions'
import {
  browserRouteSessionRegistry,
  browserRouteWebContentsRegistry
} from '../browser/browser-route-session-runtime'
import { ORCA_BROWSER_BLANK_URL } from '../../shared/constants'
import { DOC_PREVIEW_PARTITION, parseDocPreviewUrl } from '../../shared/doc-preview-scheme'
import { setDocPreviewFailureSink } from '../browser/doc-preview-failure-notice'
import {
  getDocPreviewGrant,
  revokeAllDocPreviewGrants
} from '../browser/doc-preview-grant-registry'
import { isDocPreviewSession } from '../browser/doc-preview-protocol'
import { registerPluginPanelNavigationGuard } from '../plugins/plugin-panel-navigation-guard'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { ARCA_MAINFRAME_PARTITION } from '../../shared/arca-mainframe'
import { getArcaMainframeEndpoint } from '../arca-mainframe/arca-mainframe-endpoint'
import { installArcaMainframeGuestPolicy } from '../arca-mainframe/arca-mainframe-guest-policy'
import { isArcaMainframeSession } from '../arca-mainframe/arca-mainframe-session-policy'

/**
 * Why a separate admission rule: `normalizeBrowserNavigationUrl` answers only for
 * http(s) and `file:`, so `orca-preview://` can only ever attach here — and only
 * on the doc-preview partition, carrying a grant the main process minted for a
 * deliberate user preview action. Web content has no way to reach either.
 */
function isAdmissibleDocPreviewAttach(partition: string, src: string): boolean {
  if (partition !== DOC_PREVIEW_PARTITION) {
    return false
  }
  const target = parseDocPreviewUrl(src)
  return target !== null && getDocPreviewGrant(target.grantId) !== null
}

/**
 * Why the exact panel URL and not the origin: the renderer names the src, and the only page the
 * Megamind tab is allowed to open on is the one main resolved. Later same-origin moves are the
 * guest policy's business, not the embedder's.
 */
function isAdmissibleArcaMainframeAttach(partition: string, src: string): boolean {
  return partition === ARCA_MAINFRAME_PARTITION && src === getArcaMainframeEndpoint().panelUrl
}

export function installMainWindowWebviewSecurity(mainWindow: BrowserWindow): void {
  installPrivilegedWindowNavigationPolicy(mainWindow.webContents)
  // Why here and on every fresh shell document: the renderer holds the only record of which
  // preview owns which grant, and a reload throws that record away. Grants it can no longer
  // release would stay live read authorities for the rest of the process.
  revokeAllDocPreviewGrants()
  mainWindow.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      revokeAllDocPreviewGrants()
    }
  })
  // Why these contents and not the window: every live preview is a guest of this WebContents, and
  // it is also the failure sink itself — once it is destroyed no grant it minted has a reader left.
  mainWindow.webContents.on('destroyed', () => {
    setDocPreviewFailureSink(null)
    revokeAllDocPreviewGrants()
  })
  // Why: containment must be listening before any plugin panel frame is created,
  // so register it with the window's other navigation policy.
  registerPluginPanelNavigationGuard(mainWindow.webContents)

  const browserWindowClosePreload = join(__dirname, 'browser-window-close-preload.js')
  // Why a preview gets a preload at all: it is our own editor surface, not a browsing guest. This
  // one only decides what a click on a link means, and it is pinned here so no renderer-supplied
  // value can reach a preview guest and no other attach path can acquire it.
  const docPreviewLinkPreload = join(__dirname, 'doc-preview-link-preload.js')
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const src = typeof params.src === 'string' ? params.src : ''
    const normalizedSrc = normalizeBrowserNavigationUrl(src)
    const partition = typeof webPreferences.partition === 'string' ? webPreferences.partition : ''
    const isProfilePartition = browserSessionRegistry.isAllowedPartition(partition)
    const isRoutePartition = browserRouteSessionRegistry.isAllowedPartition(partition)
    // Why: local direct-SSH partitions exist only after their proxy is verified,
    // so admission here can never race an unproxied session. They navigate like
    // profile partitions — the renderer owns their URLs, no main-side grants.
    const isLocalSshPartition = isLocalSshBrowserPartition(partition)
    const isDocPreviewAttach = isAdmissibleDocPreviewAttach(partition, src)
    const isArcaMainframeAttach = isAdmissibleArcaMainframeAttach(partition, src)

    // Why: fail closed — deny any src or partition not in the registry allowlist so a renderer bug can't smuggle preload/Node into an unprivileged guest.
    if (
      !isDocPreviewAttach &&
      !isArcaMainframeAttach &&
      (!normalizedSrc ||
        (!isProfilePartition && !isRoutePartition && !isLocalSshPartition) ||
        (isRoutePartition && normalizedSrc !== ORCA_BROWSER_BLANK_URL))
    ) {
      event.preventDefault()
      return
    }

    delete params.preload
    // Why: preload runs in the page's main world before inline scripts can call window.close().
    webPreferences.preload = isDocPreviewAttach ? docPreviewLinkPreload : browserWindowClosePreload
    // Why: older Electron builds expose preloadURL alongside preload; delete both so the guest can't inherit the main preload bridge.
    delete (webPreferences as Record<string, unknown>).preloadURL
    // Why delete something Electron does not set: 43 does not pass the embedder's
    // additionalArguments down to a guest, so this clears a key that is absent today. Kept as
    // insurance — if that ever changes, the guest would read this app's browser-host id.
    delete webPreferences.additionalArguments
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.enableBlinkFeatures = ''
    webPreferences.disableBlinkFeatures = ''
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    // Why: force the browser guest policy even if host markup omits or misspells a preference.
    Object.assign(webPreferences, ORCA_BROWSER_GUEST_WEB_PREFERENCES)
    // Why: keep the registry-validated partition so isolated session profiles use their own storage while other hardening stays intact.
    webPreferences.partition = partition
  })

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    if (isArcaMainframeSession(guest.session)) {
      // Why not browserManager: the Megamind guest is not a browser tab — no tab routing, no
      // popups, no download attribution; it browses one origin and nothing else.
      installArcaMainframeGuestPolicy(guest, { origin: getArcaMainframeEndpoint().origin })
      return
    }
    if (isDocPreviewSession(guest.session)) {
      // Why: preview guests never join browser-tab routing, popups or auth-identity tracking; the
      // workspace-doc profile is what refuses all three. The attach is also the point a live window
      // exists to receive read failures for that guest.
      setDocPreviewFailureSink(mainWindow.webContents)
      browserManager.attachGuestPolicies(guest, null, {
        profile: 'workspace-doc',
        host: mainWindow.webContents
      })
      return
    }
    // Why: attach guest popup/nav policy at creation; waiting for renderer registration races target=_blank/early redirects past it.
    browserManager.attachGuestPolicies(guest)
    // Why: route guests override the generic popup fallback and stay blank until exact main-owned registration.
    browserRouteWebContentsRegistry.attachGuest(guest)
    // Why: the session proxy cannot stop WebRTC UDP; only the per-contents policy does.
    enforceLocalSshWebRtcPolicyForGuest(guest)
  })
}
