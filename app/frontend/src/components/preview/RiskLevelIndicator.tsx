import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "medium" | "high";

const riskConfig: Record<
  RiskLevel,
  { label: string; className: string; Icon: typeof Info }
> = {
  low: {
    label: "Low risk",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Icon: Info,
  },
  medium: {
    label: "Medium risk",
    className: "bg-amber-50 text-amber-900 ring-amber-200",
    Icon: AlertTriangle,
  },
  high: {
    label: "High risk",
    className: "bg-red-50 text-red-800 ring-red-200",
    Icon: ShieldAlert,
  },
};

interface RiskLevelIndicatorProps {
  riskLevel: RiskLevel;
  className?: string;
}

export function RiskLevelIndicator({
  riskLevel,
  className,
}: RiskLevelIndicatorProps) {
  const config = riskConfig[riskLevel];
  const Icon = config.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}
