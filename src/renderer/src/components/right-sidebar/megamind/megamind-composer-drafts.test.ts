import { afterEach, expect, it } from 'vitest'
import {
  clearMegamindComposerDraftIfCurrent,
  clearMegamindComposerDrafts,
  megamindComposerDraft,
  megamindComposerDraftRevision,
  setMegamindComposerDraft
} from './megamind-composer-drafts'

afterEach(() => clearMegamindComposerDrafts('viewer'))

it('does not let an old acknowledgement clear identical text rewritten after logout', () => {
  setMegamindComposerDraft('viewer', 'arca', 'same body')
  const oldRevision = megamindComposerDraftRevision('viewer', 'arca')
  clearMegamindComposerDrafts('viewer')
  setMegamindComposerDraft('viewer', 'arca', 'same body')
  const newRevision = megamindComposerDraftRevision('viewer', 'arca')
  expect(newRevision).toBeGreaterThan(oldRevision)
  clearMegamindComposerDraftIfCurrent('viewer', 'arca', 'same body', oldRevision)
  expect(megamindComposerDraft('viewer', 'arca')).toBe('same body')
  clearMegamindComposerDraftIfCurrent('viewer', 'arca', 'same body', newRevision)
  expect(megamindComposerDraft('viewer', 'arca')).toBe('')
})
