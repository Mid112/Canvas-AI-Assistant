// Chat UI note: displays model rationale as supporting context; approvals still depend on the separate action/risk panels.

import { Lightbulb } from "lucide-react";

interface ExplanationCardProps {
  explanation: string;
}

export function ExplanationCard({ explanation }: ExplanationCardProps) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Lightbulb className="size-3.5" aria-hidden="true" />
        Explanation
      </div>
      <p className="text-sm leading-relaxed text-foreground/80">{explanation}</p>
    </div>
  );
}
