import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAgentAuthorityMode } from '@/store/agent-authority'
import type { MegamindStatus } from '../../../../shared/arca-megamind'

export function MegamindSettingsSection(): React.JSX.Element | null {
  const agentAuthority = useAgentAuthorityMode()
  const [status, setStatus] = useState<MegamindStatus>({ state: 'disconnected' })
  useEffect(() => {
    if (isWebClientLocation() || !window.api.arcaMegamind) {
      return
    }
    void window.api.arcaMegamind
      .status()
      .then(setStatus)
      .catch(() => {})
    return window.api.arcaMegamind.onUpdate(setStatus)
  }, [])
  if (isWebClientLocation()) {
    return null
  }
  const manage = async (): Promise<void> => {
    const panel = await window.api.arcaMainframe.getPanel()
    await window.api.shell.openUrl(new URL('/devices', panel.origin).href)
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {translate('arca.megamind.settingsTitle', 'ARCA Megamind')}
      </h3>
      <p className="text-xs text-muted-foreground">
        {status.state === 'connected'
          ? `${translate('arca.megamind.connectedAs', 'Connected as')} ${status.device}`
          : translate('arca.megamind.notConnected', 'Not connected')}
      </p>
      <p className="text-xs text-muted-foreground">
        {agentAuthority === 'pi'
          ? translate(
              'arca.megamind.sharedCredential',
              'Credentials are shared with Pi. Manage or revoke devices in Mainframe; this app does not delete shared credentials.'
            )
          : translate(
              'arca.megamind.sharedCredentialManaged',
              'Credentials are shared with the agents on this computer. Manage or revoke devices in Mainframe; this app does not delete shared credentials.'
            )}
      </p>
      <Button variant="outline" size="sm" onClick={() => void manage()}>
        {translate('arca.megamind.manageDevices', 'Manage devices in Mainframe')}
      </Button>
    </section>
  )
}
