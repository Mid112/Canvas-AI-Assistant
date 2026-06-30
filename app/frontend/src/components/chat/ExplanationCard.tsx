import { Lightbulb } from "lucide-react";

interface ExplanationCardProps {
  explanation: string;
}

export function ExplanationCard({ explanation }: ExplanationCardProps) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <Lightbulb className="size-3.5" aria-hidden="true" />
        Explanation
      </div>
      <p className="text-sm leading-relaxed text-blue-950/80">{explanation}</p>
    </div>
  );
}
