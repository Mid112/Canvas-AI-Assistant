import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssignmentFieldChange } from "@/types/assignment";

interface AssignmentFieldComparisonProps {
  change: AssignmentFieldChange;
}

export function AssignmentFieldComparison({
  change,
}: AssignmentFieldComparisonProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
      <p className="text-sm font-medium text-muted-foreground">{change.label}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Original
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{change.original}</p>
        </div>
        <ArrowRight
          className={cn("mx-auto size-4 text-muted-foreground md:rotate-0")}
          aria-hidden="true"
        />
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Updated
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{change.updated}</p>
        </div>
      </div>
    </div>
  );
}
