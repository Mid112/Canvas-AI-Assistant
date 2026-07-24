import { AlertTriangle, ChevronDown, RotateCcw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { paths } from "@/routes/paths";
import type { RiskMetadata } from "@/types/chat";

interface RiskAlertsProps {
  risk?: RiskMetadata;
  error?: string | null;
  canReverseAction?: boolean;
  isReversingAction?: boolean;
  reversalCompleted?: boolean;
  onReverseAction?: () => void;
}

export function RiskAlerts({
  risk,
  error,
  canReverseAction = false,
  isReversingAction = false,
  reversalCompleted = false,
  onReverseAction,
}: RiskAlertsProps) {
  if (!risk && !error) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Alerts
      </div>

      {error ? <ErrorAlert message={error} className="px-3 py-2" /> : null}

      {risk?.warnings.length ? (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            {risk.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      ) : null}

      {risk ? (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2 rounded-md bg-muted/50 px-2.5 py-2">
              <RotateCcw className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">Undo</p>
                <p className="font-medium">
                  {risk.can_undo ? "Can be undone" : "No one-click undo"}
                </p>
                {risk.can_undo && canReverseAction && onReverseAction && !reversalCompleted ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-primary/40 text-primary hover:bg-primary/10"
                    disabled={isReversingAction}
                    onClick={onReverseAction}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {isReversingAction ? "Reversing..." : "Reverse action"}
                  </Button>
                ) : risk.can_undo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    render={<Link to={paths.instructor.history} />}
                  >
                    Open workflow history
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 rounded-md bg-muted/50 px-2.5 py-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Reversibility</p>
                <p className="font-medium">{risk.reversibility}</p>
              </div>
            </div>
          </div>

          <details className="rounded-md bg-muted/50 px-2.5 py-2">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium">
              <ChevronDown className="size-4" aria-hidden="true" />
              Risk technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-background p-2 text-xs">
              {JSON.stringify(risk.technical_details, null, 2)}
            </pre>
          </details>
        </>
      ) : null}
    </section>
  );
}
