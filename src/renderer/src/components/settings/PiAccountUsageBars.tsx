import { translate } from "@/i18n/i18n";
import { useResetCountdownClock } from "@/hooks/useResetCountdownClock";
import { useAppStore } from "../../store";
import type { PiAccountUsage } from "../../../../shared/pi-account-usage";
import type { RateLimitWindow } from "../../../../shared/rate-limit-types";
import { formatResetDuration } from "../../../../shared/rate-limit-reset-format";
import {
  getDisplayedUsagePercentage,
  normalizeUsagePercentageDisplay,
} from "../../../../shared/usage-percentage-display";
import { barColor, clampUsedPercent } from "../status-bar/tooltip";
import { formatUsagePercentageLabel } from "../status-bar/usage-percentage-label";
import { usageTextColorClass } from "../status-bar/usage-roster-formatting";

function UsageBar({
  label,
  window,
  now,
  display,
}: {
  label: string;
  window: RateLimitWindow;
  now: number;
  display: "used" | "remaining";
}): React.JSX.Element {
  const used = clampUsedPercent(window.usedPercent);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barColor(used)}`}
          style={{ width: `${getDisplayedUsagePercentage(used, display)}%` }}
        />
      </div>
      <span
        className={`shrink-0 text-[11px] tabular-nums ${usageTextColorClass(used)}`}
      >
        {formatUsagePercentageLabel(used, display)}
      </span>
      {window.resetsAt !== null ? (
        <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
          {translate("piAccounts.usageRenewsIn", "renews in {{value0}}", {
            value0: formatResetDuration(window.resetsAt - now),
          })}
        </span>
      ) : null}
    </div>
  );
}

function usageNotice(usage: PiAccountUsage | undefined): string {
  if (usage?.isFetching) {
    return translate("piAccounts.usageLoading", "Reading usage…");
  }
  if (usage?.status === "error") {
    return translate(
      "piAccounts.usageUnavailable",
      "Usage is unavailable right now.",
    );
  }
  // Includes the expired-token case: ARCA does not renew a saved sign-in just to read usage.
  return translate("piAccounts.usageNoRecentData", "No recent data.");
}

export function PiAccountUsageBars({
  usage,
}: {
  usage: PiAccountUsage | undefined;
}): React.JSX.Element {
  const display = normalizeUsagePercentageDisplay(
    useAppStore((state) => state.usagePercentageDisplay),
  );
  const limits = usage?.rateLimits ?? null;
  const now = useResetCountdownClock([
    limits?.session?.resetsAt,
    limits?.weekly?.resetsAt,
  ]);
  const windows = [
    limits?.session
      ? {
          key: "session",
          label: translate("piAccounts.usageSession", "5h"),
          window: limits.session,
        }
      : null,
    limits?.weekly
      ? {
          key: "weekly",
          label: translate("piAccounts.usageWeekly", "Week"),
          window: limits.weekly,
        }
      : null,
  ].filter(
    (entry): entry is { key: string; label: string; window: RateLimitWindow } =>
      entry !== null,
  );

  if (windows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">{usageNotice(usage)}</p>
    );
  }
  return (
    <div className={`space-y-1 ${usage?.isFetching ? "animate-pulse" : ""}`}>
      {windows.map((entry) => (
        <UsageBar
          key={entry.key}
          label={entry.label}
          window={entry.window}
          now={now}
          display={display}
        />
      ))}
    </div>
  );
}
