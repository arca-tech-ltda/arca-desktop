import { useState } from "react";
import { translate } from "@/i18n/i18n";
import type {
  PiAccount,
  PiAccountProvider,
} from "../../../../shared/pi-accounts";
import { LoginLinkNotice } from "./LoginLinkNotice";
import { PiAccountProviderCard } from "./PiAccountProviderCard";
import { piAccountAddLabel } from "./pi-account-provider-label";
import { PiAccountsDetails } from "./PiAccountsDetails";
import {
  RemovePiAccountDialog,
  RenamePiAccountDialog,
} from "./pi-account-dialogs";
import {
  usePiAccounts,
  type PiAccountNameError,
  type PiAccountsNotice,
} from "./use-pi-accounts";
import { usePiAccountUsage } from "./use-pi-account-usage";

export { piAccountAddLabel };

const PROVIDERS: PiAccountProvider[] = ["anthropic", "openai-codex"];

export function piAccountNoticeText(notice: PiAccountsNotice): string {
  switch (notice.kind) {
    case "added":
      return translate("piAccounts.added", "Saved as {{value0}}.", {
        value0: notice.name ?? "",
      });
    case "duplicate":
      return translate(
        "piAccounts.duplicate",
        "That account is already saved as {{value0}}.",
        {
          value0: notice.name ?? "",
        },
      );
    case "addFailed":
      return translate(
        "piAccounts.addFailed",
        "Sign-in did not finish. Try again.",
      );
    case "removeBlocked":
      return translate(
        "piAccounts.removeBlocked",
        "This account is in use. Choose another account with Use first, then remove this one.",
      );
  }
}

function nameErrorText(error: PiAccountNameError): string {
  return error === "nameTaken"
    ? translate("piAccounts.nameTaken", "That name is already used.")
    : translate(
        "piAccounts.nameInvalid",
        "Use letters, numbers and . _ @ + - without spaces.",
      );
}

export function PiAccountsSection(): React.JSX.Element {
  const pi = usePiAccounts();
  const { usage, history } = usePiAccountUsage(!pi.remote);
  const [removeTarget, setRemoveTarget] = useState<PiAccount | null>(null);
  const [renameTarget, setRenameTarget] = useState<PiAccount | null>(null);
  const [renameError, setRenameError] = useState<PiAccountNameError | null>(
    null,
  );

  const handleRemove = async (): Promise<void> => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (target) {
      await pi.removeAccount(target);
    }
  };

  const handleRename = async (name: string): Promise<void> => {
    if (!renameTarget) {
      return;
    }
    setRenameError(null);
    const error = await pi.renameAccount(renameTarget, name);
    if (error) {
      setRenameError(error);
      return;
    }
    setRenameTarget(null);
  };

  if (pi.remote) {
    return (
      <section id="accounts-pi" className="space-y-3">
        <h3 className="text-sm font-semibold">
          {translate("piAccounts.title", "Pi accounts")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            "piAccounts.remote",
            "Switch to the local desktop to manage these accounts.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section id="accounts-pi" className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {translate("piAccounts.title", "Pi accounts")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            "piAccounts.intro",
            "Accounts Pi and the Claude and Codex CLIs sign in with, and how much of each quota is left.",
          )}
        </p>
      </div>
      <LoginLinkNotice url={pi.loginUrl} />
      {PROVIDERS.map((provider) => (
        <PiAccountProviderCard
          key={provider}
          provider={provider}
          accounts={pi.accounts.filter(
            (account) => account.provider === provider,
          )}
          usage={usage}
          history={history}
          busy={pi.busy}
          adding={pi.adding}
          onAdd={(target) => void pi.addAccount(target)}
          onCancelAdd={() => void window.api.piAccounts.cancelAdd()}
          onUse={(account) =>
            void pi.useAccount(account.provider, account.name)
          }
          onRename={(account) => {
            setRenameError(null);
            setRenameTarget(account);
          }}
          onRemove={setRemoveTarget}
        />
      ))}
      {!pi.loaded && !pi.failed ? (
        <p className="text-xs text-muted-foreground">
          {translate("piAccounts.loading", "Loading accounts…")}
        </p>
      ) : null}
      {pi.notice ? (
        <p className="text-xs text-muted-foreground">
          {piAccountNoticeText(pi.notice)}
        </p>
      ) : null}
      {pi.mirrorFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {translate(
            "piAccounts.mirrorFailed",
            "Pi switched accounts, but the CLI mirror failed. Run /accounts mirror in Pi.",
          )}
        </p>
      ) : null}
      {pi.failed ? (
        <p role="alert" className="text-xs text-destructive">
          {translate(
            "piAccounts.failed",
            "Could not read or switch Pi accounts. Check the files and run /accounts in Pi; save any new login before switching.",
          )}
        </p>
      ) : null}
      <PiAccountsDetails />
      <RemovePiAccountDialog
        target={removeTarget}
        blocked={removeTarget !== null && pi.isRemoveBlocked(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void handleRemove()}
      />
      <RenamePiAccountDialog
        target={renameTarget}
        error={renameError ? nameErrorText(renameError) : null}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => void handleRename(name)}
      />
    </section>
  );
}
