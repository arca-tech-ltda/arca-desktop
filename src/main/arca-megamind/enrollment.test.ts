import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MegamindEnrollment } from './enrollment'
import { readCredential, saveCredential, safeMegamindUrl } from './credentials'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'arca-enrollment-'))
  vi.useFakeTimers()
})
afterEach(async () => {
  vi.useRealTimers()
  await rm(directory, { recursive: true, force: true })
})
const endpoint = 'https://mainframe.example/api/arca/mcp'
const response = (value: unknown): Response => new Response(JSON.stringify(value))

function setup(status = 'approved') {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).endsWith('/poll')) {
      return response({ status })
    }
    if (String(url).endsWith('/mcp')) {
      return response({ result: { content: [{ text: '{"items":[]}' }] } })
    }
    return response({
      enrollment_id: 'abcdefghijklmno',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://mainframe.example/devices/approve',
      expires_in: 10,
      interval: 5
    })
  })
  const changed = vi.fn()
  const path = join(directory, 'config.json')
  return {
    fetcher,
    path,
    enrollment: new MegamindEnrollment({ path, endpoint, development: false, changed, fetcher })
  }
}

describe('Megamind enrollment', () => {
  it('keeps the bearer private, polls, and saves Pi-compatible credentials on approval', async () => {
    const { enrollment, path, fetcher } = setup()
    expect(await enrollment.start()).toEqual({
      state: 'pending',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://mainframe.example/devices/approve'
    })
    await vi.advanceTimersByTimeAsync(5000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(enrollment.status.state).toBe('connected'))
    const credential = await readCredential(path)
    expect(Buffer.from(credential.token, 'base64url')).toHaveLength(32)
    expect(JSON.stringify(enrollment.status)).not.toContain(credential.token)
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain('credential_hash')
    if (process.platform !== 'win32') {
      expect((await stat(credential.tokenFile)).mode & 0o777).toBe(0o600)
    }
    enrollment.stop()
  })
  it('expires without saving a credential', async () => {
    const { enrollment, path } = setup('pending')
    await enrollment.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(enrollment.status.state).toBe('expired')
    await expect(readFile(path)).rejects.toThrow()
    enrollment.stop()
  })
  it('reuses existing valid credentials without enrollment', async () => {
    const { enrollment, path, fetcher } = setup()
    await saveCredential(path, endpoint, 'existing')
    expect((await enrollment.start()).state).toBe('connected')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect((await readCredential(path)).token).toBe('existing')
    enrollment.stop()
  })
  it('does not overwrite credentials created while approval was pending', async () => {
    const { enrollment, path } = setup()
    await enrollment.start()
    await saveCredential(path, endpoint, 'concurrent-pi')
    await vi.advanceTimersByTimeAsync(5000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(enrollment.status.state).toBe('connected'))
    expect((await readCredential(path)).token).toBe('concurrent-pi')
    enrollment.stop()
  })
  it('refuses exclusive writes over an existing token', async () => {
    const path = join(directory, 'config.json')
    await saveCredential(path, endpoint, 'existing')
    await expect(saveCredential(path, endpoint, 'replacement')).rejects.toThrow()
    expect((await readCredential(path)).token).toBe('existing')
  })
  it('rejects a verification URL on another origin', async () => {
    const { path } = setup()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        enrollment_id: 'abcdefghijklmno',
        user_code: 'ABCD',
        verification_uri: 'https://evil.example',
        expires_in: 60
      })
    )
    const enrollment = new MegamindEnrollment({
      path,
      endpoint,
      development: false,
      changed: vi.fn(),
      fetcher
    })
    expect((await enrollment.start()).state).toBe('error')
    enrollment.stop()
  })
})

describe('Megamind URL policy', () => {
  it.each([
    'http://example.com',
    'https://user:secret@example.com',
    'file:///tmp/token',
    'https://example.com?q=secret',
    'https://example.com/#token'
  ])('rejects %s', (url) => expect(() => safeMegamindUrl(url)).toThrow())
  it('allows HTTPS and admits loopback HTTP only in development', () => {
    expect(safeMegamindUrl(endpoint).protocol).toBe('https:')
    expect(() => safeMegamindUrl('http://localhost:8080')).toThrow()
    expect(safeMegamindUrl('http://localhost:8080', true).protocol).toBe('http:')
    expect(() => safeMegamindUrl('http://example.com', true)).toThrow()
  })
})
