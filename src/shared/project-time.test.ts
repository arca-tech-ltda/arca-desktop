import { describe, expect, it } from 'vitest'
import {
  activeProjectSeconds,
  aggregateProjectTime,
  creditProjectTime,
  localDay,
  projectDurationParts,
  retainProjectTime
} from './project-time'

describe('project time', () => {
  it('requires focus and input, expires after five minutes and caps suspension', () => {
    expect(activeProjectSeconds(0, 15_000, -Infinity, true)).toBe(0)
    expect(activeProjectSeconds(0, 15_000, 0, false)).toBe(0)
    expect(activeProjectSeconds(0, 15_000, 0, true)).toBe(15)
    expect(activeProjectSeconds(295_000, 310_000, 0, true)).toBe(5)
    expect(activeProjectSeconds(310_000, 325_000, 0, true)).toBe(0)
    expect(activeProjectSeconds(0, 600_000, 590_000, true)).toBe(60)
    expect(activeProjectSeconds(100, 0, 0, true)).toBe(0)
  })

  it('splits local midnight and caps the credited tick', () => {
    const now = new Date(2026, 5, 15, 0, 0, 20)
    const entries = creditProjectTime([], { repoId: 'r', displayName: 'Repo', seconds: 120 }, now)
    expect(entries[0].days).toEqual({ '2026-06-14': 40, '2026-06-15': 20 })
    const renamed = creditProjectTime(
      entries,
      { repoId: 'r', displayName: 'Renamed', seconds: 10 },
      now
    )
    expect(renamed[0].displayName).toBe('Renamed')
    expect(renamed[0].days['2026-06-15']).toBe(30)
    expect(entries[0].days['2026-06-15']).toBe(20)
  })

  it('retains today plus 89 local dates and aggregates today plus six dates', () => {
    const now = new Date(2026, 5, 15, 12)
    const day = (offset: number) => localDay(new Date(2026, 5, 15 - offset, 12))
    const entries = [
      {
        repoId: 'a',
        displayName: 'A',
        days: { [day(0)]: 10, [day(6)]: 20, [day(7)]: 40, [day(89)]: 1, [day(90)]: 2, [day(-1)]: 8 }
      },
      { repoId: 'b', displayName: 'B', days: { [day(0)]: 60 } }
    ]
    const retained = retainProjectTime(entries, now)
    expect(retained[0].days[day(89)]).toBe(1)
    expect(retained[0].days[day(90)]).toBeUndefined()
    expect(aggregateProjectTime(entries, 7, now).map((row) => row.seconds)).toEqual([60, 30])
    expect(aggregateProjectTime(entries, 1, now).map((row) => row.seconds)).toEqual([60, 10])
  })

  it('formats duration parts without rounding up', () => {
    expect(projectDurationParts(59).underMinute).toBe(true)
    expect(projectDurationParts(8100)).toEqual({ hours: 2, minutes: 15, underMinute: false })
  })
})
