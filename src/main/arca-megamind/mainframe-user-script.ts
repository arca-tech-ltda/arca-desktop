/**
 * Guest-side scripts for requests that must carry the human's PocketBase session (approvals and
 * chat writes), so an agent's device credential can never impersonate a partner. The session token
 * lives in the Mainframe partition's `localStorage`: it is read and used inside that guest, and
 * only the projected public fields below ever cross back into this process.
 */

export type MainframeUserProjection =
  | 'ok'
  | 'approvals'
  | 'chatChannels'
  | 'chatMessages'
  | 'chatPost'

/** Expressions evaluated in the guest over the parsed response (`data`) and the viewer id (`uid`). */
const PROJECTIONS: Record<MainframeUserProjection, string> = {
  ok: "'ok'",
  // `woken` reports the agents an `@handle-pi` mention reached; a handle-only entry means it woke.
  chatPost:
    'Array.isArray(data.woken) ? data.woken.map(item => typeof item === "string" ? {handle: item, woken: true} : {handle: typeof item?.handle === "string" ? item.handle : "", woken: item?.woken !== false && item?.awake !== false}) : []',
  approvals:
    'Array.isArray(data.items) ? data.items.map(item => ({id: item.id, summary: item.summary, relevant: item.owner === uid})) : []',
  // The preview is optional: a Mainframe that sends no last message leaves the row subtitle to
  // the panel, which falls back to what it knows about the person.
  chatChannels:
    'Array.isArray(data.items) ? data.items.map(item => ({channel: item.channel, kind: item.kind, handle: item.handle, name: item.name, lastMessageAt: item.last_message_at, lastMessageBody: typeof item.last_message_body === "string" ? item.last_message_body : (item.last_message && typeof item.last_message.body === "string" ? item.last_message.body : "")})) : []',
  chatMessages:
    'Array.isArray(data.items) ? data.items.map(item => ({id: item.id, channel: item.channel, authorKind: item.author_kind, authorName: item.author_name, authorLabel: item.author_label, body: item.body, mentions: Array.isArray(item.mentions) ? item.mentions : [], createdAt: item.created, mine: item.author === uid})) : []'
}

const PREAMBLE = (origin: string): string => `
    if (location.origin !== ${JSON.stringify(origin)}) return null;
    let auth; try { auth = JSON.parse(localStorage.getItem('pocketbase_auth') || 'null'); } catch { return null; }
    if (!auth?.token) return null;
    const uid = auth.record?.id ?? auth.model?.id ?? '';`

export type MainframeUserRequest = {
  origin: string
  path: string
  body?: unknown
  projection: MainframeUserProjection
}

/**
 * Resolves to `null` when the guest has no human session (caller must ask for a login), otherwise
 * to `{status, data}` — a non-2xx keeps its status so `404` can be read as "server without chat".
 */
export function buildMainframeUserScript({
  origin,
  path,
  body,
  projection
}: MainframeUserRequest): string {
  return `(async () => {${PREAMBLE(origin)}
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(body === undefined ? 'GET' : 'POST')}, redirect: 'error',
      headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
      ${body === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(body))},`}
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401) return null;
    if (!response.ok) return { status: response.status, data: null };
    const data = await response.json();
    return { status: response.status, data: ${PROJECTIONS[projection]} };
  })()`
}

/** The signed-in human, read from the guest's session without any request. */
export function buildMainframeIdentityScript(origin: string): string {
  return `(async () => {${PREAMBLE(origin)}
    const record = auth.record ?? auth.model ?? {};
    const email = typeof record.email === 'string' ? record.email : '';
    return { status: 200, data: {
      id: uid,
      handle: typeof record.handle === 'string' && record.handle ? record.handle : email.split('@')[0],
      name: typeof record.name === 'string' ? record.name : ''
    } };
  })()`
}
