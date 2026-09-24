import { ARCA_MAINFRAME_DEFAULT_URL } from '../../shared/arca-mainframe'
import { megamindConfigPath, readCredential } from '../arca-megamind/credentials'

// Why: stable code shared with the renderer, which shows the localized text.
export const MEGAMIND_UPDATE_REQUIRED = 'arca-updater:megamind-required'

export function arcaUpdateChannel(value = process.env.ARCA_UPDATE_CHANNEL): string {
  if (value === undefined) {
    return 'stable'
  }
  if (!/^[a-z0-9-]{1,32}$/.test(value)) {
    throw new Error('Invalid ARCA update channel')
  }
  return value
}

export function arcaUpdateFeed(base = ARCA_MAINFRAME_DEFAULT_URL, token?: string) {
  const channel = arcaUpdateChannel()
  const url = new URL(base)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /(^|\.)github\.com$/i.test(url.hostname)
  ) {
    throw new Error('Invalid ARCA update endpoint')
  }
  if (!token?.trim()) {
    return null
  }
  return {
    provider: 'generic' as const,
    url: new URL(`/api/arca/desktop/updates/${channel}/`, url.origin).href,
    channel: 'latest',
    useMultipleRangeRequest: false,
    requestHeaders: { Authorization: `Bearer ${token.trim()}` }
  }
}

export async function readArcaUpdateFeed() {
  try {
    const credential = await readCredential(megamindConfigPath())
    const base = process.env.ARCA_MAINFRAME_URL ?? ARCA_MAINFRAME_DEFAULT_URL
    // Never send a device credential to a different enrollment host.
    if (new URL(credential.endpoint).origin !== new URL(base).origin) {
      return null
    }
    return arcaUpdateFeed(base, credential.token)
  } catch {
    return null
  }
}

export type ArcaUpdateFeed = NonNullable<Awaited<ReturnType<typeof readArcaUpdateFeed>>>

export function updateArtifactUrl(feed: ArcaUpdateFeed, filename: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename) || filename.includes('..')) {
    throw new Error('Invalid update artifact filename')
  }
  return new URL(filename, feed.url).href
}
