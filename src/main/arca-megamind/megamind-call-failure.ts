import { MegamindToolError } from './gateway'

/**
 * Why a gateway call failed, to the only resolution presence needs: a device that cannot
 * authenticate will keep failing until the user does something, while a rate limit, a 5xx or a
 * timeout is over in seconds. Treating the second as the first is what silenced every pane of the
 * app for five minutes on one 429.
 */
export type MegamindFailureKind = 'unauthorized' | 'transient'

const UNAUTHORIZED_MESSAGE =
  /HTTP (401|403)|credential|unauthorized|forbidden|invalid[ _]token|Invalid Megamind (configuration|URL)/i
const UNAUTHORIZED_DETAIL = /unauthorized|forbidden|invalid[ _]token|not[ _]enrolled|no[ _]device/

export function classifyMegamindFailure(error: unknown): MegamindFailureKind {
  if (error instanceof MegamindToolError) {
    return UNAUTHORIZED_DETAIL.test(error.detail) ? 'unauthorized' : 'transient'
  }
  // A missing config file is the device that was never enrolled — the silent no-op path.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
    return 'unauthorized'
  }
  return error instanceof Error && UNAUTHORIZED_MESSAGE.test(error.message)
    ? 'unauthorized'
    : 'transient'
}
