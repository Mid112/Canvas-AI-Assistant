import { FileText, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ActionSummaryCardProps {
  originalRequest: string;
  requestedBy: string;
  requestedAt: string;
  summary: string;
  aiExplanation: string[];
  aiExplanationNote?: string;
}

export function ActionSummaryCard({
  originalRequest,
  requestedBy,
  requestedAt,
  summary,
  aiExplanation,
  aiExplanationNote,
}: ActionSummaryCardProps) {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-blue-600" aria-hidden="true" />
            Original Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm leading-relaxed text-[#334155]">{originalRequest}</p>
          <p className="text-xs text-muted-foreground">
            Requested by: {requestedBy} &bull; {formatRelativeTime(requestedAt)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-blue-50/60 shadow-sm ring-1 ring-blue-100/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#1e3a5f]">
            <Sparkles className="size-4 text-violet-600" aria-hidden="true" />
            AI Explanation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm font-medium text-[#1e3a5f]">What this workflow will do:</p>
          <p className="text-sm leading-relaxed text-[#334155]">{summary}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-[#334155]">
            {aiExplanation.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {aiExplanationNote ? (
            <p className="text-xs italic text-[#475569]">Note: {aiExplanationNote}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
