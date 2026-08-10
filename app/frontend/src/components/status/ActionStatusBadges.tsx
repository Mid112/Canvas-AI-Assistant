import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types/chat";

/**
 * The one place risk and reversibility are given a colour and a word.
 *
 * These two signals used to be styled independently on every surface that
 * showed them -- the quiz dialog and the feedback dialog held byte-identical
 * copies of the same table, the grades page hardcoded its labels and painted
 * "Medium Risk" emerald while everywhere else emerald meant low risk, and
 * ReversibilityStatus kept a fourth palette. An instructor comparing two
 * confirm screens could reasonably conclude they meant different things.
 *
 * Colour convention, applied to both scales so one hue always means one thing:
 *   emerald = safe / undoable, amber = caution, red = irreversible or high risk.
 */

const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-50 text-amber-900 ring-amber-200",
  high: "bg-red-50 text-red-800 ring-red-200",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

const BADGE_BASE =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <span className={cn(BADGE_BASE, RISK_STYLES[level], className)}>
      {level === "high" ? (
        <ShieldAlert className="size-3" aria-hidden="true" />
      ) : null}
      {RISK_LABELS[level]}
    </span>
  );
}

interface ReversibilityBadgeProps {
  /** Mirrors the backend's is_reversible() for the action being confirmed.
   * Only two states reach the confirm surfaces; the three-level
   * ReversibilityLevel ("partially-reversible") exists solely on the dry-run
   * page, which keeps using ReversibilityStatus. */
  reversible: boolean;
  className?: string;
}

export function ReversibilityBadge({
  reversible,
  className,
}: ReversibilityBadgeProps) {
  return (
    <span
      className={cn(
        BADGE_BASE,
        reversible
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-red-50 text-red-800 ring-red-200",
        className,
      )}
    >
      {reversible ? (
        <RotateCcw className="size-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="size-3" aria-hidden="true" />
      )}
      {reversible ? "Reversible" : "Irreversible"}
    </span>
  );
}

interface ActionStatusBadgesProps {
  level: RiskLevel;
  reversible: boolean;
  className?: string;
}

/** Both signals together, for the confirm surfaces that show a heading with
 * its status to the right. Kept as one component so the order stays the same
 * everywhere -- risk first, then reversibility. */
export function ActionStatusBadges({
  level,
  reversible,
  className,
}: ActionStatusBadgesProps) {
  return (
    <span className={cn("flex flex-wrap items-center gap-2", className)}>
      <RiskBadge level={level} />
      <ReversibilityBadge reversible={reversible} />
    </span>
  );
}
