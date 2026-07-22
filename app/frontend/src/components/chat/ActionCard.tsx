import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { InterpretedAction } from "@/types/chat";

interface ActionCardProps {
  action: InterpretedAction;
}

export function ActionCard({ action }: ActionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasLinks = action.primaryLink || action.secondaryLink;
  const risk = action.risk;
  const hasTechnicalDetails =
    action.technicalDetails && action.technicalDetails.length > 0;
  // Badge color is intentionally derived only from risk_level so every
  // action surface presents low/medium/high risk consistently.
  const riskClassName =
    risk?.risk_level === "high"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : risk?.risk_level === "medium"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="size-3.5" aria-hidden="true" />
        Interpreted Action
        {risk ? (
          <Badge variant="outline" className={cn("ml-auto capitalize", riskClassName)}>
            {risk.risk_level} risk
          </Badge>
        ) : null}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Action</dt>
          <dd className="font-medium">{action.action}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Course</dt>
          <dd className="font-medium">{action.course}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Affected Students</dt>
          <dd className="font-medium">{action.affectedStudents}</dd>
        </div>
      </dl>

      {risk ? (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3 text-sm">
          {risk.warnings.length > 0 ? (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                {risk.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2 rounded-md bg-background px-2.5 py-2">
              <RotateCcw className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Undo</p>
                <p className="font-medium">{risk.can_undo ? "Can be undone" : "No one-click undo"}</p>
              </div>
            </div>
            <div className="flex gap-2 rounded-md bg-background px-2.5 py-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Reversibility</p>
                <p className="font-medium">{risk.reversibility}</p>
              </div>
            </div>
          </div>

          <details className="rounded-md bg-background px-2.5 py-2">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium">
              <ChevronDown className="size-4" aria-hidden="true" />
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-xs">
              {JSON.stringify(risk.technical_details, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      {hasTechnicalDetails ? (
        <div className="mt-3 border-t border-border/70 pt-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            Technical details
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                detailsOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {detailsOpen ? (
            <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
              {action.technicalDetails!.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="font-medium text-foreground">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {hasLinks ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {action.primaryLink ? (
            <Link
              to={action.primaryLink.href}
              state={{
                returnTo: paths.instructor.assistant,
                ...action.primaryLink.state,
              }}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              {action.primaryLink.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          {action.secondaryLink ? (
            <Link
              to={action.secondaryLink.href}
              state={action.secondaryLink.state}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              {action.secondaryLink.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
