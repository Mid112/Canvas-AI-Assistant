// Preview UI note: presents reversibility status review details before any Canvas write is confirmed.

import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReversibilityLevel } from "@/types/dryRunPreview";

const reversibilityConfig: Record<
  ReversibilityLevel,
  {
    label: string;
    badgeClassName: string;
    bannerClassName: string;
    iconClassName: string;
    Icon: typeof CheckCircle2;
    heading: string;
  }
> = {
  reversible: {
    label: "Reversible",
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    bannerClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconClassName: "text-emerald-600",
    Icon: RotateCcw,
    heading: "Reversible Action",
  },
  "partially-reversible": {
    label: "Partially Reversible",
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
    bannerClassName: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "text-amber-600",
    Icon: AlertTriangle,
    heading: "Review Recommended",
  },
  irreversible: {
    label: "Irreversible",
    badgeClassName:
      "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10",
    bannerClassName: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "text-amber-600",
    Icon: AlertTriangle,
    heading: "Review Required",
  },
};

interface ReversibilityStatusProps {
  reversibility: ReversibilityLevel;
  explanation: string;
}

export function ReversibilityStatus({
  reversibility,
  explanation,
}: ReversibilityStatusProps) {
  const config = reversibilityConfig[reversibility];
  const Icon = config.Icon;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border px-4 py-4",
          config.bannerClassName,
        )}
        role="status"
      >
        <div className="flex items-start gap-3">
          <Icon
            className={cn("mt-0.5 size-5 shrink-0", config.iconClassName)}
            aria-hidden="true"
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{config.heading}</p>
              <Badge className={config.badgeClassName} variant="outline">
                {config.label}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{explanation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
