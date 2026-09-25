import { describe, expect, it, vi, afterEach } from 'vitest'
import { arcaUpdateFeed, readArcaUpdateFeed, updateArtifactUrl } from './arca-update-feed'
import {
  ARCA_UPDATE_FEED_ACCESS_DENIED,
  ARCA_UPDATE_SERVER_UNAVAILABLE,
  arcaUpdateFeedUnavailableMessage
} from './arca-update-feed-failure'
import { areAutoUpdatesEnabled } from './auto-update-policy'
import { readCredential } from '../arca-megamind/credentials'

vi.mock('../arca-megamind/credentials', () => ({
  megamindConfigPath: () => '/config',
  readCredential: vi.fn()
}))
afterEach(() => vi.unstubAllEnvs())

describe('ARCA update policy', () => {
  it('enables only the authenticated stable generic feed', () => {
    expect(areAutoUpdatesEnabled()).toBe(true)
    const feed = arcaUpdateFeed(undefined, 'device-token')
    expect(feed).toEqual({
      provider: 'generic',
      channel: 'latest',
      useMultipleRangeRequest: false,
      url: 'https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/',
      requestHeaders: { Authorization: 'Bearer device-token' }
    })
    expect(arcaUpdateFeed()).toBeNull()
    expect(arcaUpdateFeed(undefined, ' ')).toBeNull()
    expect(() => arcaUpdateFeed('https://github.com/stablyai/orca', 'token')).toThrow()
    expect(() => arcaUpdateFeed('http://mainframe.arcatech.com.br', 'token')).toThrow()
  })

  it('reads enrollment credentials and refuses mismatched hosts or absent tokens', async () => {
    vi.stubEnv('ARCA_MAINFRAME_URL', 'https://mainframe.arcatech.com.br')
    vi.mocked(readCredential).mockRejectedValueOnce(new Error('missing'))
    expect(await readArcaUpdateFeed()).toBeNull()
    vi.mocked(readCredential).mockResolvedValue({
      endpoint: 'https://mainframe.arcatech.com.br/api',
      token: 'abc',
      tokenFile: '/token'
    })
    expect((await readArcaUpdateFeed())?.requestHeaders.Authorization).toBe('Bearer abc')
    vi.stubEnv('ARCA_MAINFRAME_URL', 'https://other.example')
    expect(await readArcaUpdateFeed()).toBeNull()
  })

  it.each([
    ['Update feed HTTP 404', ARCA_UPDATE_SERVER_UNAVAILABLE],
    ['Update feed HTTP 401', ARCA_UPDATE_FEED_ACCESS_DENIED],
    ['Update feed HTTP 403', ARCA_UPDATE_FEED_ACCESS_DENIED],
    ['fetch failed: network error', 'arca-updater:network-unavailable'],
    ['getaddrinfo ENOTFOUND mainframe', 'arca-updater:network-unavailable'],
    ['request timed out', 'arca-updater:network-unavailable']
  ])('classifies unavailable feed failure %s', (message, expected) => {
    expect(arcaUpdateFeedUnavailableMessage(new Error(message))).toBe(expected)
  })

  it('does not classify integrity or installation failures as feed availability', () => {
    expect(arcaUpdateFeedUnavailableMessage(new Error('sha512 checksum mismatch'))).toBeNull()
    expect(arcaUpdateFeedUnavailableMessage(new Error('installer launch failed'))).toBeNull()
  })

  it('rejects external and traversal artifact URLs', () => {
    const feed = arcaUpdateFeed(undefined, 'token')!
    expect(updateArtifactUrl(feed, 'arca-macos-1.5.123-arm64.zip')).toContain(
      '/stable/arca-macos-1.5.123-arm64.zip'
    )
    for (const name of [
      'https://github.com/stablyai/orca',
      '../x.zip',
      'a..zip',
      '/x.zip',
      'x/y.zip'
    ]) {
      expect(() => updateArtifactUrl(feed, name)).toThrow()
    }
  })
})
