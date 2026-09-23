import { describe, expect, it } from 'vitest'
import {
  ARCA_MAINFRAME_DEFAULT_URL,
  classifyArcaMainframeNavigation,
  isAllowedArcaMainframePermission,
  parseArcaMainframeBaseUrl,
  resolveArcaMainframeEndpoint
} from './arca-mainframe'

describe('parseArcaMainframeBaseUrl', () => {
  it('accepts an https base and appends the panel path', () => {
    expect(parseArcaMainframeBaseUrl('https://mainframe.arcatech.com.br')).toEqual({
      origin: 'https://mainframe.arcatech.com.br',
      panelUrl: 'https://mainframe.arcatech.com.br/megamind'
    })
  })

  it('keeps a base path prefix and drops query and fragment', () => {
    expect(parseArcaMainframeBaseUrl('https://host.example/app/?a=1#x')).toEqual({
      origin: 'https://host.example',
      panelUrl: 'https://host.example/app/megamind'
    })
  })

  it('rejects plain http by default', () => {
    expect(parseArcaMainframeBaseUrl('http://localhost:3000')).toBeNull()
    expect(parseArcaMainframeBaseUrl('http://mainframe.arcatech.com.br')).toBeNull()
  })

  it('allows http only for loopback when explicitly permitted', () => {
    expect(
      parseArcaMainframeBaseUrl('http://localhost:3000', { allowInsecureLoopback: true })
    ).toEqual({
      origin: 'http://localhost:3000',
      panelUrl: 'http://localhost:3000/megamind'
    })
    expect(
      parseArcaMainframeBaseUrl('http://mainframe.arcatech.com.br', { allowInsecureLoopback: true })
    ).toBeNull()
  })

  it('rejects non-web schemes, credentials and malformed input', () => {
    expect(parseArcaMainframeBaseUrl('file:///etc/passwd')).toBeNull()
    expect(parseArcaMainframeBaseUrl('javascript:alert(1)')).toBeNull()
    expect(parseArcaMainframeBaseUrl('https://user:pass@host.example')).toBeNull()
    expect(parseArcaMainframeBaseUrl('not a url')).toBeNull()
    expect(parseArcaMainframeBaseUrl('')).toBeNull()
    expect(parseArcaMainframeBaseUrl(undefined)).toBeNull()
    expect(parseArcaMainframeBaseUrl(42)).toBeNull()
  })
})

describe('resolveArcaMainframeEndpoint', () => {
  it('uses an admissible override', () => {
    expect(resolveArcaMainframeEndpoint('https://staging.arcatech.com.br').panelUrl).toBe(
      'https://staging.arcatech.com.br/megamind'
    )
  })

  it('falls back to the shipped default when the override is rejected', () => {
    for (const rejected of ['http://evil.example', 'nonsense', undefined]) {
      expect(resolveArcaMainframeEndpoint(rejected)).toEqual({
        origin: ARCA_MAINFRAME_DEFAULT_URL,
        panelUrl: `${ARCA_MAINFRAME_DEFAULT_URL}/megamind`
      })
    }
  })
})

describe('classifyArcaMainframeNavigation', () => {
  const origin = 'https://mainframe.arcatech.com.br'

  it('keeps same-origin navigation inside the guest', () => {
    expect(classifyArcaMainframeNavigation(origin, `${origin}/megamind/session/1`)).toBe('internal')
    expect(classifyArcaMainframeNavigation(origin, `${origin}/login?next=/megamind`)).toBe(
      'internal'
    )
  })

  it('routes other web origins to the system browser', () => {
    expect(classifyArcaMainframeNavigation(origin, 'https://github.com/org/repo')).toBe('external')
    expect(classifyArcaMainframeNavigation(origin, 'http://example.com')).toBe('external')
    // A different port or scheme on the same host is still a different origin.
    expect(classifyArcaMainframeNavigation(origin, 'https://mainframe.arcatech.com.br:8443/')).toBe(
      'external'
    )
    expect(
      classifyArcaMainframeNavigation(origin, 'https://evil.mainframe.arcatech.com.br.attacker.io/')
    ).toBe('external')
  })

  it('blocks anything that is not http(s)', () => {
    expect(classifyArcaMainframeNavigation(origin, 'file:///etc/passwd')).toBe('block')
    expect(classifyArcaMainframeNavigation(origin, 'javascript:alert(1)')).toBe('block')
    expect(classifyArcaMainframeNavigation(origin, 'about:blank')).toBe('block')
    expect(classifyArcaMainframeNavigation(origin, 'orca-preview://abc/index.html')).toBe('block')
    expect(classifyArcaMainframeNavigation(origin, 'not a url')).toBe('block')
  })
})

describe('isAllowedArcaMainframePermission', () => {
  it('allows only clipboard permissions', () => {
    expect(isAllowedArcaMainframePermission('clipboard-read')).toBe(true)
    expect(isAllowedArcaMainframePermission('clipboard-sanitized-write')).toBe(true)
    for (const denied of ['media', 'geolocation', 'notifications', 'midi', 'openExternal']) {
      expect(isAllowedArcaMainframePermission(denied)).toBe(false)
    }
  })
})
