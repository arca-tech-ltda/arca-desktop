export type CodexRateLimitFetchOptions = {
  codexHomePath?: string | null
  allowPtyFallback?: boolean
  /** Credential to use instead of reading a Codex home (bucket-held Pi accounts). */
  backendCredentials?: { accessToken: string; accountId?: string | null }
  signal?: AbortSignal
}
