import { describe, expect, it } from 'vitest'
import { parseArcaDeepLink } from './arca-deep-link'

describe('ARCA deep links', () => {
  it('parses the four supported destinations', () => {
    expect(parseArcaDeepLink('arca://megamind')).toEqual({ kind: 'megamind' })
    expect(parseArcaDeepLink('arca://megamind/approval/abcdefghijklmno')).toEqual({
      kind: 'megamind',
      approvalId: 'abcdefghijklmno'
    })
    expect(parseArcaDeepLink('arca://project/repo-name')).toEqual({
      kind: 'project',
      repo: 'repo-name'
    })
    expect(parseArcaDeepLink('arca://task/repo-name/42')).toEqual({
      kind: 'task',
      repo: 'repo-name',
      line: 42
    })
  })
  it.each([
    'https://megamind',
    'arca://unknown',
    'arca://project/a%2Fb',
    'arca://task/repo/0',
    'arca://task/repo/-1',
    'arca://task/repo/1?exec=x',
    'arca://megamind#token',
    'arca://user@megamind',
    'arca://project/%00',
    'arca://project/%',
    'arca://project/../secret'
  ])('ignores invalid input %s', (raw) => expect(parseArcaDeepLink(raw)).toBeNull())
})
