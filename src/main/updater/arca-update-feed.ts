import { ARCA_MAINFRAME_DEFAULT_URL } from '../../shared/arca-mainframe'
import { megamindConfigPath, readCredential } from '../arca-megamind/credentials'

export const MEGAMIND_UPDATE_REQUIRED = 'Conecte ao Megamind para receber atualizações'

export function arcaUpdateFeed(base = ARCA_MAINFRAME_DEFAULT_URL, token?: string) {
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
    url: new URL('/api/arca/desktop/updates/stable/', url.origin).href,
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
