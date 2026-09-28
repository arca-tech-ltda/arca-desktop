import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import { showTerminalShortcutCaptureNotification } from '@/lib/terminal-shortcut-capture-notification'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { subscribeToUnpairedDeviceAuthNotification } from '../unpaired-device-auth-notification'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { useAppStore } from '../../store'
import { registerMegamindEvents } from '@/attention/megamind-events'
import { routeMegamindPanel } from '@/attention/megamind-panel-route'

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  if (navigator.userAgent.includes('Windows')) {
    return 'win32'
  }
  return 'linux'
}

export function registerSettingsAndSidebarIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(registerMegamindEvents())
  unsubs.push(
    window.api.ui.onOpenSettings(() => {
      useAppStore.getState().openSettingsPage()
    })
  )

  const unsubscribeOpenSkillShare = window.api.ui.onOpenSkillShare?.((shareId) => {
    useAppStore.getState().openSkillShare(shareId)
  })
  if (unsubscribeOpenSkillShare) {
    unsubs.push(unsubscribeOpenSkillShare)
  }

  // Why: a tray "Settings…" click can fire before this attaches; consume any queued intent (?. guards stale preload).
  void window.api.ui
    .consumePendingOpenSettings?.()
    .then((open) => {
      if (open) {
        useAppStore.getState().openSettingsPage()
      }
    })
    .catch(() => {})

  const pendingSkillShare = window.api.ui.consumePendingSkillShare?.()
  if (pendingSkillShare && typeof pendingSkillShare.then === 'function') {
    void pendingSkillShare
      .then((shareId) => {
        if (shareId) {
          useAppStore.getState().openSkillShare(shareId)
        }
      })
      .catch(() => {})
  }

  unsubs.push(
    window.api.ui.onOpenSetupGuide?.(() => {
      useAppStore.getState().openModal('setup-guide', { telemetrySource: 'help_menu' })
    }) ?? (() => {})
  )

  // Why: a client stuck in a silent 4001 auth loop (lost device registry) reads as
  // "it won't connect" with no clue on either end; main throttles to once per session.
  unsubs.push(
    subscribeToUnpairedDeviceAuthNotification(window.api.mobile, () => {
      toast.warning(
        translate(
          'auto.hooks.useIpcEvents.ef223fbb6b',
          'A device tried to connect but is not paired'
        ),
        {
          id: 'unpaired-device-auth-failure',
          description: translate(
            'auto.hooks.useIpcEvents.unpairedDeviceRepairHint',
            'If this was an ARCA client, re-pair it from Settings → ARCA Servers.'
          ),
          // Why: main emits this recovery path once per session, so it must remain visible until acted on or dismissed.
          duration: Infinity,
          action: {
            label: translate('auto.hooks.useIpcEvents.openServerSettings', 'Open Server Settings'),
            onClick: () => {
              const store = useAppStore.getState()
              store.openSettingsTarget({ pane: 'servers', repoId: null })
              store.openSettingsPage()
            }
          }
        }
      )
    })
  )

  unsubs.push(
    window.api.ui.onOpenFeatureTour(() => {
      useAppStore.getState().openModal('feature-wall', { source: 'help_menu' })
    })
  )

  // Why: View > Appearance toggles settings in main and broadcasts; merge into the store for an immediate re-render.
  unsubs.push(
    window.api.settings.onChanged((updates) => {
      const store = useAppStore.getState()
      if (!store.settings) {
        return
      }
      const { worktreeVisibilityDefaults, ...activeOwnerUpdates } = updates
      const settingsUpdates = store.settings.activeRuntimeEnvironmentId
        ? activeOwnerUpdates
        : updates
      useAppStore.setState({
        settings: {
          ...store.settings,
          ...settingsUpdates,
          notifications: {
            ...store.settings.notifications,
            ...updates.notifications
          }
        },
        ...(worktreeVisibilityDefaults
          ? {
              worktreeVisibilityDefaultsByHost: {
                ...store.worktreeVisibilityDefaultsByHost,
                local: worktreeVisibilityDefaults
              }
            }
          : {})
      })
      if ('worktreeVisibilityDefaults' in updates) {
        void store.fetchAllWorktrees({ visibilityOwnerHostId: 'local' })
      }
    })
  )

  // Why: UI view-state is shared with mobile via ui.set; re-hydrate so mobile changes reflect live in the desktop sidebar.
  unsubs.push(
    window.api.ui.onStateChanged((ui) => {
      useAppStore.getState().hydratePersistedUI(ui, 'sync')
    })
  )

  if (window.api.keybindings) {
    unsubs.push(
      window.api.keybindings.onChanged((snapshot) => {
        useAppStore.getState().setKeybindingSnapshot(snapshot)
      })
    )
  }

  unsubs.push(
    window.api.ui.onToggleLeftSidebar(() => {
      useAppStore.getState().toggleSidebar()
    })
  )

  unsubs.push(
    window.api.ui.onToggleRightSidebar(() => {
      const store = useAppStore.getState()
      if (!canShowRightSidebarForView(store.activeView)) {
        return
      }
      store.toggleRightSidebar()
    })
  )

  // Why optional: a paired web client and an older preload have no Megamind channel.
  const unsubscribeShowMegamind = window.api.ui.onShowMegamindPanel?.((route) => {
    const store = useAppStore.getState()
    if (!canShowRightSidebarForView(store.activeView)) {
      store.setActiveView('terminal')
    }
    store.setRightSidebarTab('megamind')
    store.setRightSidebarOpen(true)
    if (route) {
      routeMegamindPanel(route)
    }
  })
  if (unsubscribeShowMegamind) {
    unsubs.push(unsubscribeShowMegamind)
  }

  unsubs.push(
    window.api.ui.onToggleWorktreePalette(() => {
      const store = useAppStore.getState()
      if (store.activeModal === 'worktree-palette') {
        store.closeModal()
        return
      }
      store.openModal('worktree-palette')
    })
  )

  unsubs.push(
    window.api.ui.onToggleFloatingTerminal(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))
    })
  )

  if (window.api.ui.onTerminalShortcutCaptured) {
    unsubs.push(
      window.api.ui.onTerminalShortcutCaptured(({ actionId }) => {
        showTerminalShortcutCaptureNotification({
          actionId,
          platform: getShortcutPlatform(),
          keybindings: useAppStore.getState().keybindings
        })
      })
    )
  }
}
