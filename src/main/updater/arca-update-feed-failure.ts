export const ARCA_UPDATE_SERVER_UNAVAILABLE = 'arca-updater:server-unavailable'
export const ARCA_UPDATE_FEED_ACCESS_DENIED = 'arca-updater:feed-access-denied'

export function arcaUpdateFeedUnavailableMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b(?:401|403)\b/.test(message)) {
    return ARCA_UPDATE_FEED_ACCESS_DENIED
  }
  if (
    /\b404\b/.test(message) ||
    /\b(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_NETWORK)\b/i.test(message) ||
    /fetch failed|network error|timed? out|timeout|dns/i.test(message)
  ) {
    return ARCA_UPDATE_SERVER_UNAVAILABLE
  }
  return null
}
