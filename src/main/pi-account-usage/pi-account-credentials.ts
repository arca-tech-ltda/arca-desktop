import { join } from "node:path";
import type { PiAccountProvider } from "../../shared/pi-accounts";
import { readCodexAccessTokenIdentity } from "../pi-accounts/credential-conversion";
import {
  bucketSchema,
  readJson,
  resolvePiAgentDir,
} from "../pi-accounts/files";

const PROVIDERS: PiAccountProvider[] = ["anthropic", "openai-codex"];

/** A bucket account with the parts usage needs. `access` stays inside main. */
export type PiAccountCredential = {
  provider: PiAccountProvider;
  name: string;
  email: string | null;
  access: string | null;
  accountId: string | null;
  /** Unix ms; 0 or undefined in the bucket means "refresh on first use". */
  expires: number;
};

export function piAccountKey(
  provider: PiAccountProvider,
  name: string,
): string {
  return `${provider}/${name}`;
}

/**
 * An expired access token is never refreshed here: the bucket's refresh lock belongs to Pi and to
 * the per-account lock protocol, so usage reports "no recent data" instead of rotating a token.
 */
export function hasUsableAccessToken(
  credential: PiAccountCredential,
  now = Date.now(),
): boolean {
  return Boolean(credential.access) && credential.expires > now;
}

export async function readPiAccountCredentials(
  agentDir = resolvePiAgentDir(),
): Promise<PiAccountCredential[]> {
  const bucket = bucketSchema.parse(
    await readJson(join(agentDir, "accounts.json"), {
      version: 1,
      active: {},
      accounts: {},
    }),
  );
  return PROVIDERS.flatMap((provider) =>
    Object.entries(bucket.accounts[provider] ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, cred]) => {
        const codex =
          provider === "openai-codex"
            ? readCodexAccessTokenIdentity(cred.access)
            : null;
        return {
          provider,
          name,
          email: codex?.email ?? null,
          access: cred.access ?? null,
          accountId: cred.accountId ?? codex?.accountId ?? null,
          expires: typeof cred.expires === "number" ? cred.expires : 0,
        };
      }),
  );
}
