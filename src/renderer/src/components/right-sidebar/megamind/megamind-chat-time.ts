import { formatUiRelativeTime } from '@/i18n/relative-time-format'

/** PocketBase prints `2026-01-01 12:30:00Z`; only the T-form parses everywhere. */
function parse(value: string): number | null {
  const parsed = Date.parse(value.replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : null
}

export function megamindClockTime(value: string): string {
  const parsed = parse(value)
  return parsed === null
    ? ''
    : new Date(parsed).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Clock time while it is today, and the relative day before that — as a chat list reads. */
export function megamindConversationTime(value: string, now = Date.now()): string {
  const parsed = parse(value)
  if (parsed === null) {
    return ''
  }
  return new Date(parsed).toDateString() === new Date(now).toDateString()
    ? megamindClockTime(value)
    : formatUiRelativeTime(parsed - now)
}
