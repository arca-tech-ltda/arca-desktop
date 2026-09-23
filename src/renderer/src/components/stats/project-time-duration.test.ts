import { expect, it, vi } from 'vitest'
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values: Record<string, number> = {}) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key]))
}))
import { formatProjectDuration } from './project-time-duration'
it('formats short, minute and hour durations', () => {
  expect(formatProjectDuration(0)).toBe('< 1 min')
  expect(formatProjectDuration(59)).toBe('< 1 min')
  expect(formatProjectDuration(60)).toBe('1 min')
  expect(formatProjectDuration(8100)).toBe('2 h 15 min')
})
