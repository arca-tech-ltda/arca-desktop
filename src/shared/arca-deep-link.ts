export type ArcaDeepLink =
  | { kind: 'megamind'; approvalId?: string }
  | { kind: 'project'; repo: string }
  | { kind: 'task'; repo: string; line: number }

export function parseArcaDeepLink(raw: string): ArcaDeepLink | null {
  if (raw.length > 2048 || !raw.startsWith('arca://')) {
    return null
  }
  try {
    if (raw.includes('\\') || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(raw)) {
      return null
    }
    const url = new URL(raw)
    if (url.username || url.password || url.port || url.search || url.hash) {
      return null
    }
    const parts = url.pathname.split('/').slice(1).map(decodeURIComponent)
    if (url.hostname === 'megamind') {
      if (url.pathname === '' || url.pathname === '/') {
        return { kind: 'megamind' }
      }
      if (parts.length === 2 && parts[0] === 'approval' && /^[a-z0-9]{15}$/.test(parts[1])) {
        return { kind: 'megamind', approvalId: parts[1] }
      }
      return null
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(parts[0] ?? '')) {
      return null
    }
    if (url.hostname === 'project' && parts.length === 1) {
      return { kind: 'project', repo: parts[0] }
    }
    if (url.hostname === 'task' && parts.length === 2 && /^[1-9]\d{0,6}$/.test(parts[1])) {
      return { kind: 'task', repo: parts[0], line: Number(parts[1]) }
    }
    return null
  } catch {
    return null
  }
}
