// Chat UI note: shows the backend's interpreted action, risk label, and handoff links without implying the action has already run.

import { ArrowRight, ChevronDown, Zap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { InterpretedAction } from "@/types/chat";

interface ActionCardProps {
  action: InterpretedAction;
  /** Dismiss a form-handoff offer (no pending Workflow to cancel). */
  onDismiss?: () => void;
}

export function ActionCard({ action, onDismiss }: ActionCardProps) {
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

      {hasLinks || onDismiss ? (
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
          {onDismiss ? (
            <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
