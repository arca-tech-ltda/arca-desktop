import type { Menu } from 'electron'
import type { UpdateCheckOptions, UpdateStatus } from '../../shared/update-status-types'
import { translateMain } from '../i18n/main-i18n'

let menu: Menu | null = null
let ready = false

export function setArcaUpdateMenu(value: Menu): void {
  menu = value
  refreshLabel()
}

export function updateArcaMenuStatus(status: UpdateStatus): void {
  ready = status.state === 'downloaded'
  refreshLabel()
}

export function restartFromArcaMenu(): boolean {
  if (!ready) {
    return false
  }
  void import('../updater').then((updater) => updater.quitAndInstall())
  return true
}

function refreshLabel(): void {
  const item = menu?.getMenuItemById?.('arca-check-update')
  if (item) {
    item.label = ready
      ? translateMain('menu.restartToUpdate', 'Restart to Update')
      : translateMain('menu.checkForUpdates', 'Check for Updates...')
  }
}

export function createArcaUpdateMenuItem(
  onCheck: (options: UpdateCheckOptions) => void
): Electron.MenuItemConstructorOptions {
  return {
    id: 'arca-check-update',
    label: translateMain('menu.checkForUpdates', 'Check for Updates...'),
    click: (_item, _window, event) => {
      if (restartFromArcaMenu()) {
        return
      }
      const isMac = process.platform === 'darwin'
      const modifierClick = !event.triggeredByAccelerator
      const localBuild = isMac && modifierClick && event.altKey === true
      const includePerfPrerelease =
        !localBuild && modifierClick && (isMac ? event.metaKey === true : event.ctrlKey === true)
      onCheck({
        includePrerelease: !localBuild && modifierClick && event.shiftKey === true,
        includePerfPrerelease,
        ...(localBuild ? { localBuild: true } : {})
      })
    }
  }
}
