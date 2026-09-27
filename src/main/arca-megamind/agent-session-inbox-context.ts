import type { MegamindRecord } from '../../shared/arca-megamind'

/** Record ids of the gateway (`^[a-z0-9]{15}$`), the only shape `acknowledge` takes (§2.10). */
const RECORD_ID = /^[a-z0-9]{15}$/
const MAX_ITEMS = 10
const MAX_BODY_CHARS = 280

export type MegamindInboxContext = { text: string; ids: string[] }

function oneLine(value: unknown, limit = MAX_BODY_CHARS): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, limit)
    : ''
}

function describe(item: MegamindRecord): string {
  const from = oneLine(item.from_owner_name || item.author_name || item.from_label, 40)
  const author = from ? `${from}: ` : ''
  switch (item.kind) {
    case 'message':
      return `mensagem de ${author}${oneLine(item.body)}`
    case 'chat':
      return `chat ${oneLine(item.channel, 40)} de ${author}${oneLine(item.body)}`
    case 'request':
      return `pedido de ${author}${oneLine(item.title, 80)} — ${oneLine(item.body)}`
    case 'request_update':
      return `pedido "${oneLine(item.title, 80)}" agora ${oneLine(item.status, 20)}${item.result ? `: ${oneLine(item.result)}` : ''}`
    case 'approval_decision':
      return `aprovação "${oneLine(item.summary, 80)}" ${oneLine(item.status, 20)}${item.note ? `: ${oneLine(item.note)}` : ''}`
    default:
      return oneLine(item.body || item.title || item.summary)
  }
}

/**
 * The pending inbox of one pane as prompt context. Short on purpose: the agent gets the ids and
 * calls the `arca-megamind` MCP tools when it needs the whole item.
 */
export function formatInboxContext(items: MegamindRecord[]): MegamindInboxContext | null {
  const lines: string[] = []
  const ids: string[] = []
  for (const item of items) {
    if (typeof item.id !== 'string' || !RECORD_ID.test(item.id) || ids.includes(item.id)) {
      continue
    }
    const description = describe(item)
    if (!description) {
      continue
    }
    ids.push(item.id)
    lines.push(`- [${item.id}] ${description}`)
    if (ids.length >= MAX_ITEMS) {
      break
    }
  }
  if (!ids.length) {
    return null
  }
  return {
    text: [
      `ARCA Megamind — ${ids.length} ${ids.length === 1 ? 'item pendente' : 'itens pendentes'} para esta sessão:`,
      ...lines,
      'Use as tools do MCP arca-megamind (inbox, request_update, chat_post) para responder.'
    ].join('\n'),
    ids
  }
}
