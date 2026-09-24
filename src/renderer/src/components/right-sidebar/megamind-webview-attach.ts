import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../shared/browser-guest-web-preferences'
import type { ArcaMainframePanelDescriptor } from '../../../../shared/arca-mainframe'

export type MegamindWebviewHandle = {
  detach: () => void
  reload: () => void
  navigate: (url: string) => void
}

/**
 * Attaches the Megamind guest. Main admits this partition/src pair and owns everything the guest
 * may then do, so nothing here is a security boundary — no `allowpopups`, no preload, no nodeintegration.
 */
export function attachMegamindWebview({
  container,
  panel,
  ariaLabel,
  onLoadStarted,
  onLoadStopped,
  onLoadFailed
}: {
  container: HTMLElement
  panel: ArcaMainframePanelDescriptor
  ariaLabel: string
  onLoadStarted: () => void
  onLoadStopped: () => void
  onLoadFailed: (event: Electron.DidFailLoadEvent) => void
}): MegamindWebviewHandle {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: `createElement('webview')` returns the Electron webview tag; the DOM lib types it as HTMLElement.
  const webview = document.createElement('webview') as Electron.WebviewTag
  webview.setAttribute('partition', panel.partition)
  webview.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
  webview.setAttribute('aria-label', ariaLabel)
  // The guest paints its own canvas; without this the panel surface shows through while it loads.
  webview.style.backgroundColor = '#fff'
  webview.style.display = 'flex'
  webview.style.width = '100%'
  webview.style.height = '100%'
  webview.style.border = 'none'
  webview.addEventListener('did-start-loading', onLoadStarted)
  webview.addEventListener('did-stop-loading', onLoadStopped)
  webview.addEventListener('did-fail-load', onLoadFailed)
  container.appendChild(webview)
  webview.setAttribute('src', panel.panelUrl)

  return {
    navigate: (url) => {
      try {
        if (new URL(url).origin === panel.origin) {
          webview.setAttribute('src', url)
        }
      } catch {
        /* Refuse malformed navigation targets. */
      }
    },
    detach: () => {
      webview.removeEventListener('did-start-loading', onLoadStarted)
      webview.removeEventListener('did-stop-loading', onLoadStopped)
      webview.removeEventListener('did-fail-load', onLoadFailed)
      webview.remove()
    },
    reload: () => {
      try {
        webview.reload()
      } catch {
        webview.setAttribute('src', panel.panelUrl)
      }
    }
  }
}
