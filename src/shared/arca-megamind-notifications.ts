import type { MegamindRecord } from './arca-megamind'

export class MegamindNotificationDedup {
  private seen = new Set<string>()
  accept(item: MegamindRecord): boolean {
    if (
      typeof item.id !== 'string' ||
      !['request', 'approval_pending', 'approval_decision', 'handoff', 'request_update'].includes(
        String(item.kind)
      )
    ) {
      return false
    }
    if (item.kind === 'request_update' && item.status !== 'done' && item.status !== 'failed') {
      return false
    }
    const key = `${item.kind}:${item.id}`
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    if (this.seen.size > 2000) {
      const oldest = this.seen.values().next().value
      if (oldest) {
        this.seen.delete(oldest)
      }
    }
    return true
  }
}
