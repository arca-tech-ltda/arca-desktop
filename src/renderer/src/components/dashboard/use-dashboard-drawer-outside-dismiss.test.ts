import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDashboardDrawerKeepOpenTarget } from './use-dashboard-drawer-outside-dismiss'

// Why the EventTarget members: they let the fakes satisfy the checked
// parameter type without a cast.
class FakeNode implements EventTarget {
  parentElement: FakeElement | null = null

  addEventListener(): void {}

  removeEventListener(): void {}

  dispatchEvent(): boolean {
    return false
  }
}

class FakeElement extends FakeNode {
  private readonly attributes: ReadonlySet<string>

  constructor(attributes: readonly string[] = [], parentElement: FakeElement | null = null) {
    super()
    this.attributes = new Set(attributes)
    this.parentElement = parentElement
  }

  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) {
      return this
    }
    return this.parentElement?.closest(selector) ?? null
  }

  private matches(selector: string): boolean {
    return selector
      .split(',')
      .map((part) => part.trim())
      .some((part) => this.attributes.has(part))
  }
}

describe('agent dashboard drawer outside dismiss keep-open targets', () => {
  beforeEach(() => {
    vi.stubGlobal('Node', FakeNode)
    vi.stubGlobal('Element', FakeElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the drawer open when a Sonner toast action is clicked', () => {
    const toast = new FakeElement(['[data-sonner-toast]'])
    const action = new FakeElement([], toast)

    expect(isDashboardDrawerKeepOpenTarget(action)).toBe(true)
  })

  it('keeps the drawer open when the contextual tour panel is clicked', () => {
    const panel = new FakeElement(['[data-contextual-tour-panel]'])
    const nextButton = new FakeElement([], panel)

    expect(isDashboardDrawerKeepOpenTarget(nextButton)).toBe(true)
  })

  it('does not keep the drawer open for generic outside content', () => {
    const target = new FakeElement()

    expect(isDashboardDrawerKeepOpenTarget(target)).toBe(false)
  })
})
