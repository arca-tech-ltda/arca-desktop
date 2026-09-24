import { app, BrowserWindow } from 'electron'
import { parseArcaDeepLink, type ArcaDeepLink } from '../../shared/arca-deep-link'

const pending: ArcaDeepLink[] = []
export function captureArcaDeepLinks(argv: readonly string[]): void {
  for (const arg of argv) {
    const link = parseArcaDeepLink(arg)
    if (!link) {
      continue
    }
    if (pending.length < 50) {
      pending.push(link)
    }
    if (app.isReady()) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('arcaMegamind:deepLink', link)
      }
    }
  }
}
export function takeArcaDeepLinks(): ArcaDeepLink[] {
  return pending.splice(0)
}
