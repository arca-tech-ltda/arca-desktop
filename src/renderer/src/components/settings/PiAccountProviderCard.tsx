import { Loader2, Plus, X } from "lucide-react";
import { translate } from "@/i18n/i18n";
import type {
  PiAccount,
  PiAccountProvider,
} from "../../../../shared/pi-accounts";
import type {
  PiAccountUsage,
  PiAccountUsageSample,
} from "../../../../shared/pi-account-usage";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ClaudeIcon, OpenAIIcon } from "../status-bar/icons";
import { PiAccountRow } from "./PiAccountRow";
import {
  piAccountAddLabel,
  piAccountProviderLabel,
} from "./pi-account-provider-label";
import { piAccountUsageKey } from "./use-pi-account-usage";

export function PiAccountProviderCard({
  provider,
  accounts,
  usage,
  history,
  busy,
  adding,
  onAdd,
  onCancelAdd,
  onUse,
  onRename,
  onRemove,
}: {
  provider: PiAccountProvider;
  accounts: PiAccount[];
  usage: Record<string, PiAccountUsage>;
  history: Record<string, PiAccountUsageSample[]>;
  busy: boolean;
  adding: PiAccountProvider | null;
  onAdd: (provider: PiAccountProvider) => void;
  onCancelAdd: () => void;
  onUse: (account: PiAccount) => void;
  onRename: (account: PiAccount) => void;
  onRemove: (account: PiAccount) => void;
}): React.JSX.Element {
  const isAdding = adding === provider;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            {provider === "anthropic" ? (
              <ClaudeIcon size={16} />
            ) : (
              <OpenAIIcon size={16} />
            )}
            {piAccountProviderLabel(provider)}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {accounts.map((account) => {
            const key = piAccountUsageKey(account.provider, account.name);
            return (
              <PiAccountRow
                key={key}
                account={account}
                usage={usage[key]}
                history={history[key] ?? []}
                busy={busy || adding !== null}
                onUse={() => onUse(account)}
                onRename={() => onRename(account)}
                onRemove={() => onRemove(account)}
              />
            );
          })}
          {accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                "piAccounts.emptyProvider",
                "No accounts saved for {{value0}}.",
                {
                  value0: piAccountProviderLabel(provider),
                },
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={busy || adding !== null}
              onClick={() => onAdd(provider)}
            >
              {isAdding ? <Loader2 className="animate-spin" /> : <Plus />}
              {piAccountAddLabel(provider)}
            </Button>
            {isAdding ? (
              <Button size="sm" variant="ghost" onClick={onCancelAdd}>
                <X />
                {translate("piAccounts.cancel", "Cancel")}
              </Button>
            ) : null}
          </div>
          {isAdding ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                "piAccounts.signingIn",
                "Finish the sign-in in your browser. ARCA saves the account when it completes.",
              )}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
