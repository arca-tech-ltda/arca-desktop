import { app, BrowserWindow, ipcMain, type WebContents } from 'electron'
import { join } from 'node:path'
import { getArcaMainframeEndpoint } from '../arca-mainframe/arca-mainframe-endpoint'
import { megamindConfigPath } from './credentials'
import { configureMegamindPaneSessionIdStore } from './megamind-pane-session-id'
import { startMegamindAgentPresence } from './agent-presence-service'
import { MegamindEnrollment } from './enrollment'
import { MegamindDeviceClient } from './device-client'
import { pendingApprovals, decideApproval } from './human-approvals'
import { takeArcaDeepLinks } from './deep-links'
import { megamindPrerequisites } from './prerequisites'
import { isTrustedUIRenderer } from '../ipc/ui'
import { notifyMegamindPrioritiesChanged, setMegamindPriorityProvider } from './priorities'

function requireRenderer(sender: WebContents): void {
  if (!isTrustedUIRenderer(sender)) {
    throw new Error('Untrusted Megamind caller')
  }
}

export function registerMegamind(): void {
  configureMegamindPaneSessionIdStore(app.getPath('userData'))
  startMegamindAgentPresence(megamindConfigPath(), !app.isPackaged)
  const publish = (channel: string, value: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, value)
    }
  }
  const subscribers = new Set<WebContents>()
  ipcMain.on('arcaMegamind:subscribe', (event) => {
    if (!isTrustedUIRenderer(event.sender) || subscribers.has(event.sender)) {
      return
    }
    subscribers.add(event.sender)
    event.sender.once('destroyed', () => subscribers.delete(event.sender))
    event.sender.once('render-process-gone', () => subscribers.delete(event.sender))
  })
  ipcMain.on('arcaMegamind:unsubscribe', (event) => subscribers.delete(event.sender))
  const client = new MegamindDeviceClient(
    megamindConfigPath(),
    !app.isPackaged,
    join(app.getPath('userData'), 'megamind-sessions.json'),
    (item) => {
      if (typeof item.kind === 'string' && item.kind.toLowerCase().includes('priority')) {
        notifyMegamindPrioritiesChanged()
      }
      const target = [...subscribers].find((sender) => !sender.isDestroyed())
      if (!target) {
        return false
      }
      target.send('arcaMegamind:notification', item)
      return true
    },
    (connected) => enrollment.connectionChanged(connected)
  )
  setMegamindPriorityProvider(() => client.priorities())
  const enrollment = new MegamindEnrollment({
    path: megamindConfigPath(),
    endpoint: new URL('/api/arca/mcp', getArcaMainframeEndpoint().origin).href,
    development: !app.isPackaged,
    changed: (status) => {
      publish('arcaMegamind:update', status)
      if (status.state === 'connected') {
        client.start()
      }
    }
  })
  ipcMain.handle('arcaMegamind:prerequisites', (event) => {
    requireRenderer(event.sender)
    return megamindPrerequisites()
  })
  ipcMain.handle('arcaMegamind:status', (event) => {
    requireRenderer(event.sender)
    return enrollment.status
  })
  ipcMain.handle('arcaMegamind:startEnrollment', (event) => {
    requireRenderer(event.sender)
    return enrollment.start()
  })
  ipcMain.handle('arcaMegamind:agents', (event) => {
    requireRenderer(event.sender)
    return client.agents()
  })
  ipcMain.handle('arcaMegamind:requests', (event) => {
    requireRenderer(event.sender)
    return client.requests()
  })
  ipcMain.handle('arcaMegamind:approvals', (event) => {
    requireRenderer(event.sender)
    return pendingApprovals(event.sender)
  })
  ipcMain.handle('arcaMegamind:decide', (event, id: string, decision: string) => {
    requireRenderer(event.sender)
    return decideApproval(event.sender, id, decision)
  })
  ipcMain.handle(
    'arcaMegamind:createRequest',
    (event, to: string, title: string, body: string, project: string) => {
      requireRenderer(event.sender)
      if (
        typeof to !== 'string' ||
        to.length > 200 ||
        typeof title !== 'string' ||
        title.length > 200 ||
        typeof body !== 'string' ||
        body.length > 8192 ||
        typeof project !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(project)
      ) {
        throw new Error('Invalid request')
      }
      return client.createRequest(to, title, body, project)
    }
  )
  ipcMain.handle('arcaMegamind:takeDeepLinks', (event) => {
    requireRenderer(event.sender)
    return takeArcaDeepLinks()
  })
  app.once('before-quit', () => {
    setMegamindPriorityProvider(null)
    client.stop()
    enrollment.stop()
  })
  void enrollment.restore()
}
