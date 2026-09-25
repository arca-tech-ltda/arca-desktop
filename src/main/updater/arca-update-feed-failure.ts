export const ARCA_UPDATE_SERVER_UNAVAILABLE = 'arca-updater:server-unavailable'
export const ARCA_UPDATE_FEED_ACCESS_DENIED = 'arca-updater:feed-access-denied'

export function arcaUpdateFeedUnavailableMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b(?:401|403)\b/.test(message)) {
    return ARCA_UPDATE_FEED_ACCESS_DENIED
  }
  if (isArcaUpdateNetworkError(error)) {
    return 'arca-updater:network-unavailable'
  }
  if (/\b(?:404|5\d\d)\b/.test(message)) {
    return ARCA_UPDATE_SERVER_UNAVAILABLE
  }
  return null
}

export function isArcaUpdateNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_NETWORK|ERR_CONNECTION|ERR_TIMED_OUT|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|fetch failed|network error|timed? out|timeout|dns/i.test(
    message
  )
}

export async function retryArcaUpdateNetwork<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isArcaUpdateNetworkError(error)) {
      throw error
    }
    return operation()
  }
}
