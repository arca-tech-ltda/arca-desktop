/**
 * Mentions of the Megamind chat: `@handle` names a person (notification only) and `@handle-pi` /
 * `@handle-agente` names that person's agent (the server wakes it). Parsing lives here so the
 * composer, the highlighter and the notification filter agree on what counts as a mention.
 */

import {
  megamindSessionName,
  type MegamindMemberSession,
  type MegamindSessionStatus
} from './arca-megamind-chat'

const HANDLE = '[a-z][a-z0-9-]{1,31}'
/** A mention starts at a word boundary: `me@handle` and `a-@handle` are not mentions. */
const MENTION_IN_BODY = new RegExp(`(^|[^\\p{L}\\p{N}_@-])@(${HANDLE})`, 'giu')
const AGENT_SUFFIX = /-(?:pi|agente)$/

export const AGENT_MENTION_SUFFIX = '-pi'

export type MentionSegment = { text: string; mention: boolean }

/** Splits a message body into plain and mention segments, in order. */
export function splitMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  let cursor = 0
  for (const match of body.matchAll(MENTION_IN_BODY)) {
    const start = (match.index ?? 0) + match[1].length
    if (start > cursor) {
      segments.push({ text: body.slice(cursor, start), mention: false })
    }
    segments.push({ text: `@${match[2]}`, mention: true })
    cursor = start + match[2].length + 1
  }
  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), mention: false })
  }
  return segments
}

/** Every handle mentioned in the body, agent suffix stripped, without repetition. */
export function bodyMentionHandles(body: string): string[] {
  const handles: string[] = []
  for (const match of body.matchAll(MENTION_IN_BODY)) {
    const handle = match[2].toLowerCase().replace(AGENT_SUFFIX, '')
    if (!handles.includes(handle)) {
      handles.push(handle)
    }
  }
  return handles
}

export function mentionsHandle(body: string, handle: string): boolean {
  if (!handle) {
    return false
  }
  return bodyMentionHandles(body).includes(handle.toLowerCase())
}

/** Handles mentioned as the person (`@handle`); `@handle-pi` addresses their agent, not them. */
export function personMentionHandles(body: string): string[] {
  const handles: string[] = []
  for (const match of body.matchAll(MENTION_IN_BODY)) {
    const handle = match[2].toLowerCase()
    if (!AGENT_SUFFIX.test(handle) && !handles.includes(handle)) {
      handles.push(handle)
    }
  }
  return handles
}

/**
 * Whether `handle` was addressed as the person. The server's `mentions` list is trusted for what
 * the body does not show, but never over a body that only names the agent (`@handle-pi`).
 */
export function mentionsPerson(
  body: string,
  handle: string,
  serverMentions?: readonly string[]
): boolean {
  if (!handle) {
    return false
  }
  const needle = handle.toLowerCase()
  if (personMentionHandles(body).includes(needle)) {
    return true
  }
  if (bodyMentionHandles(body).includes(needle)) {
    return false
  }
  return (serverMentions ?? []).some((mention) => mention.toLowerCase() === needle)
}

export type MentionDraft = { query: string; start: number }

/** The `@…` token the caret sits in, or null when the caret is not writing a mention. */
export function mentionDraftAt(text: string, caret: number): MentionDraft | null {
  const before = text.slice(0, caret)
  const match = /(?:^|[\s(])@([a-z0-9-]*)$/i.exec(before)
  if (!match) {
    return null
  }
  return { query: match[1].toLowerCase(), start: before.length - match[1].length - 1 }
}

export function applyMentionCompletion(
  text: string,
  caret: number,
  handle: string
): { text: string; caret: number } {
  const draft = mentionDraftAt(text, caret)
  if (!draft) {
    return { text, caret }
  }
  const inserted = `@${handle} `
  return {
    text: `${text.slice(0, draft.start)}${inserted}${text.slice(caret)}`,
    caret: draft.start + inserted.length
  }
}

/** The session a candidate points at, when the suggestion came from someone's session list. */
export type MentionCandidateSession = {
  id: string
  name: string
  status: MegamindSessionStatus
}

export type MentionCandidate = {
  /** Text written into the body. */
  handle: string
  name: string
  agent: boolean
  session?: MentionCandidateSession
}

type MentionMember = {
  handle: string
  name: string
  sessions?: readonly MegamindMemberSession[]
}

/**
 * Person, agent and session mentions for each member, filtered by the typed prefix. The person
 * comes first so a plain `@handle` stays the cheapest completion. A session suggestion writes the
 * owner's agent handle: addressing one session by name is a server capability the Mainframe does
 * not have yet, and `@handle-pi` is what wakes the agent behind it today.
 */
export function mentionCandidates(
  members: readonly MentionMember[],
  query: string,
  limit = 8
): MentionCandidate[] {
  const needle = query.toLowerCase()
  const candidates: MentionCandidate[] = []
  for (const member of members) {
    const agentHandle = `${member.handle}${AGENT_MENTION_SUFFIX}`
    if (member.handle.startsWith(needle)) {
      candidates.push({ handle: member.handle, name: member.name, agent: false })
    }
    if (!agentHandle.startsWith(needle)) {
      continue
    }
    candidates.push({ handle: agentHandle, name: member.name, agent: true })
    for (const session of member.sessions ?? []) {
      candidates.push({
        handle: agentHandle,
        name: member.name,
        agent: true,
        session: {
          id: session.sessionId,
          name: megamindSessionName(session),
          status: session.status
        }
      })
    }
  }
  return candidates.slice(0, limit)
}
