import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { translate } from "@/i18n/i18n";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

/** Operational notes most users never need: where accounts live and what changes after a switch. */
export function PiAccountsDetails(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {translate("piAccounts.details", "Details")}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 pt-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              "piAccounts.scope",
              "Local desktop accounts. For SSH or WSL, use /accounts on that host.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              "piAccounts.add",
              "Sign in here to add an account; Pi and the Claude and Codex CLIs then use it. You can also save one from Pi with /accounts save <provider> <name>.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              "piAccounts.default",
              "Using a Pi account selects system default for Orca managed accounts. Restart existing Claude or Codex terminals after switching.",
            )}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
