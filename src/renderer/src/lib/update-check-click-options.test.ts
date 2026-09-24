import { describe, expect, it } from 'vitest'
import { getUpdateCheckClickOptions, getUpdateCheckHint } from './update-check-click-options'

describe('ARCA update check controls', () => {
  it('never selects upstream RC, perf or local channels via modifiers', () => {
    const event = { altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }
    expect(getUpdateCheckClickOptions(event, true)).toEqual({})
    expect(getUpdateCheckClickOptions(event, false)).toEqual({})
    expect(getUpdateCheckHint()).toBe('Mainframe ARCA · stable')
  })
})
