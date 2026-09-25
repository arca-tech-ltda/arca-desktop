import { LoginLinkNotice } from './LoginLinkNotice'
import { useCodexPendingLoginUrl } from './use-codex-pending-login-url'

/** The sign-in link of an in-flight managed-account `codex login`. */
export function CodexLoginLinkNotice(): React.JSX.Element | null {
  const url = useCodexPendingLoginUrl()
  return <LoginLinkNotice url={url} />
}
