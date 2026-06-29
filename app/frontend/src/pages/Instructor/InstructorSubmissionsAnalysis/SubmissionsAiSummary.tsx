import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubmissionAiSummary } from "@/types/submission";

interface SubmissionsAiSummaryProps {
  summary: SubmissionAiSummary;
}

export function SubmissionsAiSummary({ summary }: SubmissionsAiSummaryProps) {
  return (
    <Card className="h-fit shadow-sm ring-1 ring-border/60">
      <CardHeader className="border-b border-blue-100 bg-blue-50/60">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          AI-Generated Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Key Insights</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.keyInsights}
          </p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Recommendation</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.recommendation}
          </p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Late Submission Trends</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.lateSubmissionsNote}
          </p>
        </div>
      </CardContent>
      <CardFooter className="border-t bg-transparent pt-4">
        <Button className="w-full" size="lg" disabled>
          Regenerate Summary
        </Button>
      </CardFooter>
    </Card>
  );
}
