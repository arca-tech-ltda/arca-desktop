import { describe, expect, it } from 'vitest'
import { FULL_RUN_MIN_GIB, fullRunGib, isFocusedRun } from './run-vitest-with-memory-budget.mjs'

describe('vitest memory lease', () => {
  it('treats a path filter as focused, so it never waits for a lease', () => {
    expect(isFocusedRun(['src/main/foo.test.ts'])).toBe(true)
    expect(isFocusedRun(['--reporter=dot', 'src/main'])).toBe(true)
  })

  it('treats a run with only flags (or nothing) as the full suite', () => {
    expect(isFocusedRun([])).toBe(false)
    expect(isFocusedRun(['--reporter=dot'])).toBe(false)
  })

  it('claims per worker, never below the floor', () => {
    expect(fullRunGib(10)).toBe(6)
    expect(fullRunGib(1)).toBe(FULL_RUN_MIN_GIB)
  })
})
