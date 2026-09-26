import { describe, expect, it } from 'vitest'
import {
  classifyAgentWorktree,
  isTempDirWorktreePath,
  parseAgentWorktreeMarker
} from './agent-worktree'

describe('parseAgentWorktreeMarker', () => {
  it('reads every documented field', () => {
    expect(
      parseAgentWorktreeMarker(
        JSON.stringify({
          agent: 'claude',
          task: 'Fix the sidebar',
          createdBy: 'orchestrator',
          createdAt: 1700000000000
        })
      )
    ).toEqual({
      agent: 'claude',
      task: 'Fix the sidebar',
      createdBy: 'orchestrator',
      createdAt: 1700000000000
    })
  })

  it('accepts an empty object as proof an agent wrote it', () => {
    expect(parseAgentWorktreeMarker('{}')).toEqual({})
  })

  it('accepts an ISO createdAt', () => {
    expect(parseAgentWorktreeMarker('{"createdAt":"2024-01-02T03:04:05.000Z"}')).toEqual({
      createdAt: Date.parse('2024-01-02T03:04:05.000Z')
    })
  })

  it('drops blank and wrongly typed fields', () => {
    expect(parseAgentWorktreeMarker('{"agent":"  ","task":42,"createdAt":-1}')).toEqual({})
  })

  it('rejects malformed JSON and non-objects', () => {
    expect(parseAgentWorktreeMarker('not json')).toBeNull()
    expect(parseAgentWorktreeMarker('[]')).toBeNull()
    expect(parseAgentWorktreeMarker('"agent"')).toBeNull()
  })
})

describe('isTempDirWorktreePath', () => {
  it('matches macOS temp spellings', () => {
    const roots = ['/var/folders/xx/T', '/tmp', '/private/tmp']
    expect(isTempDirWorktreePath('/tmp/arca-notif-wt', roots)).toBe(true)
    expect(isTempDirWorktreePath('/private/tmp/arca-ui-wt', roots)).toBe(true)
    expect(isTempDirWorktreePath('/var/folders/xx/T/agent-wt', roots)).toBe(true)
  })

  it('ignores the temp root itself and paths outside it', () => {
    expect(isTempDirWorktreePath('/tmp', ['/tmp'])).toBe(false)
    expect(isTempDirWorktreePath('/Users/dev/code/feature', ['/tmp'])).toBe(false)
    expect(isTempDirWorktreePath('/tmpfoo/wt', ['/tmp'])).toBe(false)
  })

  it('compares Windows temp roots case-insensitively and across separators', () => {
    const roots = ['C:\\Users\\Dev\\AppData\\Local\\Temp']
    expect(isTempDirWorktreePath('c:/users/dev/appdata/local/temp/arca-wt', roots)).toBe(true)
    expect(isTempDirWorktreePath('C:\\Users\\Dev\\AppData\\Local\\Temp\\arca-wt', roots)).toBe(true)
    expect(isTempDirWorktreePath('C:\\Users\\Dev\\code\\arca-wt', roots)).toBe(false)
  })

  it('keeps POSIX roots case-sensitive', () => {
    expect(isTempDirWorktreePath('/TMP/arca-wt', ['/tmp'])).toBe(false)
  })
})

describe('classifyAgentWorktree', () => {
  const tempRoots = ['/tmp']

  it('prefers the marker over the path heuristic', () => {
    expect(
      classifyAgentWorktree({
        worktreePath: '/Users/dev/code/wt',
        markerContents: '{"agent":"codex","task":"Ship it"}',
        tempRoots
      })
    ).toEqual({ source: 'marker', agent: 'codex', task: 'Ship it' })
  })

  it('falls back to the temp-dir heuristic without a marker', () => {
    expect(classifyAgentWorktree({ worktreePath: '/tmp/arca-cleanup-wt', tempRoots })).toEqual({
      source: 'temp-dir'
    })
  })

  it('falls back to the heuristic when the marker is unreadable', () => {
    expect(
      classifyAgentWorktree({
        worktreePath: '/tmp/arca-cleanup-wt',
        markerContents: 'corrupt',
        tempRoots
      })
    ).toEqual({ source: 'temp-dir' })
  })

  it('leaves an ordinary external worktree unclassified', () => {
    expect(
      classifyAgentWorktree({ worktreePath: '/Users/dev/code/feature', tempRoots })
    ).toBeUndefined()
  })
})
