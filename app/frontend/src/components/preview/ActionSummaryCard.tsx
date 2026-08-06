// Preview UI note: presents action summary card review details before any Canvas write is confirmed.

import { FileText, GitCompare, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { FieldChange, PlanField } from "@/types/dryRunPreview";

interface ActionSummaryCardProps {
  originalRequest: string;
  requestedBy: string;
  requestedAt: string;
  summary: string;
  aiExplanation: string[];
  aiExplanationNote?: string;
  changesFromPreviousRequest?: FieldChange[];
  proposedPlan?: PlanField[];
}

function describeChange(change: FieldChange): string {
  switch (change.type) {
    case "added":
      return `${change.label} added: "${change.to}"`;
    case "removed":
      return `${change.label} removed (was "${change.from}")`;
    case "changed":
      return `${change.label} changed from "${change.from}" to "${change.to}"`;
  }
}

export function ActionSummaryCard({
  originalRequest,
  requestedBy,
  requestedAt,
  summary,
  aiExplanation,
  aiExplanationNote,
  changesFromPreviousRequest,
  proposedPlan,
}: ActionSummaryCardProps) {
  const hasStructuredPlan = proposedPlan !== undefined && proposedPlan.length > 0;

  return (
    <div className="space-y-4">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            {hasStructuredPlan ? "Proposed Plan" : "Original Request"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {hasStructuredPlan ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              {proposedPlan.map((planField) => (
                <div key={planField.field} className="contents">
                  <dt className="font-medium text-foreground">{planField.label}</dt>
                  <dd className="text-muted-foreground">{planField.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{originalRequest}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Requested by: {requestedBy} &bull; {formatRelativeTime(requestedAt)}
          </p>
          {changesFromPreviousRequest && changesFromPreviousRequest.length > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
                <GitCompare className="size-3.5" aria-hidden="true" />
                Changed from your last request
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-emerald-950">
                {changesFromPreviousRequest.map((change) => (
                  <li key={change.field}>{describeChange(change)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5 shadow-sm ring-1 ring-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            AI Explanation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm font-medium text-foreground">What this workflow will do:</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {aiExplanation.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {aiExplanationNote ? (
            <p className="text-xs italic text-muted-foreground">Note: {aiExplanationNote}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
