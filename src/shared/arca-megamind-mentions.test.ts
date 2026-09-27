import { describe, expect, it } from 'vitest'
import {
  applyMentionCompletion,
  bodyMentionHandles,
  mentionCandidates,
  mentionDraftAt,
  mentionsHandle,
  splitMentionSegments
} from './arca-megamind-mentions'

describe('chat mentions', () => {
  it('reads handles only at a word boundary and strips the agent suffix', () => {
    expect(bodyMentionHandles('oi @biel e @enzo-pi, cc @biel')).toEqual(['biel', 'enzo'])
    expect(bodyMentionHandles('mail me@biel.com or a-@enzo')).toEqual([])
    expect(bodyMentionHandles('(@daniel-agente) começa')).toEqual(['daniel'])
  })
  it('matches a mention of the viewer as person or agent', () => {
    expect(mentionsHandle('@biel olha isso', 'biel')).toBe(true)
    expect(mentionsHandle('@biel-pi roda o deploy', 'biel')).toBe(true)
    expect(mentionsHandle('@bielzinho', 'biel')).toBe(false)
    expect(mentionsHandle('@biel', '')).toBe(false)
  })
  it('splits a body into plain and mention segments preserving the original text', () => {
    const segments = splitMentionSegments('oi @enzo-pi, veja')
    expect(segments).toEqual([
      { text: 'oi ', mention: false },
      { text: '@enzo-pi', mention: true },
      { text: ', veja', mention: false }
    ])
    expect(segments.map((segment) => segment.text).join('')).toBe('oi @enzo-pi, veja')
  })
})

describe('composer autocomplete', () => {
  it('detects the mention under the caret and ignores emails and finished mentions', () => {
    expect(mentionDraftAt('oi @en', 6)).toEqual({ query: 'en', start: 3 })
    expect(mentionDraftAt('oi @en falou', 12)).toBeNull()
    expect(mentionDraftAt('me@biel', 7)).toBeNull()
    expect(mentionDraftAt('@', 1)).toEqual({ query: '', start: 0 })
  })
  it('replaces the typed token and leaves the caret after a trailing space', () => {
    expect(applyMentionCompletion('oi @en', 6, 'enzo-pi')).toEqual({
      text: 'oi @enzo-pi ',
      caret: 12
    })
    expect(applyMentionCompletion('oi @en fim', 6, 'enzo')).toEqual({
      text: 'oi @enzo  fim',
      caret: 9
    })
  })
  it('offers the person before the agent and filters by prefix', () => {
    const members = [
      { handle: 'biel', name: 'Biel' },
      { handle: 'enzo', name: 'Enzo' }
    ]
    expect(mentionCandidates(members, 'en')).toEqual([
      { handle: 'enzo', name: 'Enzo', agent: false },
      { handle: 'enzo-pi', name: 'Enzo', agent: true }
    ])
    expect(mentionCandidates(members, 'enzo-p')).toEqual([
      { handle: 'enzo-pi', name: 'Enzo', agent: true }
    ])
    expect(mentionCandidates(members, 'zzz')).toEqual([])
  })
})
