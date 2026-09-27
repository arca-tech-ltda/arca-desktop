import { translate } from "@/i18n/i18n";
import type { PiAccountProvider } from "../../../../shared/pi-accounts";

/** Provider ids (`anthropic`, `openai-codex`) are storage keys; the screen shows product names. */
export function piAccountProviderLabel(provider: PiAccountProvider): string {
  return provider === "anthropic"
    ? translate("piAccounts.providerClaude", "Claude")
    : translate("piAccounts.providerCodex", "Codex");
}

export function piAccountAddLabel(provider: PiAccountProvider): string {
  return provider === "anthropic"
    ? translate("piAccounts.addClaude", "Add Claude account")
    : translate("piAccounts.addCodex", "Add Codex account");
}
