import { describe, expect, it } from 'vitest'
import { browserFileUrlToAbsolutePath } from './browser-file-url-path'

describe('browserFileUrlToAbsolutePath', () => {
  it('decodes local file URLs across path flavors', () => {
    expect(browserFileUrlToAbsolutePath('file:///tmp/Design%20Review.html')).toBe(
      '/tmp/Design Review.html'
    )
    expect(browserFileUrlToAbsolutePath('file:///C:/repo/report.HTM')).toBe('C:\\repo\\report.HTM')
    expect(browserFileUrlToAbsolutePath('file://server/share/report.html')).toBe(
      '\\\\server\\share\\report.html'
    )
  })

  it('ignores non-file URLs and unparsable input', () => {
    expect(browserFileUrlToAbsolutePath('https://example.com/report.html')).toBeNull()
    expect(browserFileUrlToAbsolutePath('not a url')).toBeNull()
  })
})
