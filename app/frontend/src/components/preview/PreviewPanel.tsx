import { Sparkles } from "lucide-react";

import { ActionSummaryCard } from "@/components/preview/ActionSummaryCard";
import { ActionTypeSection } from "@/components/preview/ActionTypeSection";
import { AffectedResourcesCard } from "@/components/preview/AffectedResourcesCard";
import { PreviewActions } from "@/components/preview/PreviewActions";
import { ReversibilityStatus } from "@/components/preview/ReversibilityStatus";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

interface PreviewPanelProps {
  preview: DryRunPreviewData;
  isConfirming?: boolean;
  confirmError?: string | null;
  onReject: () => void;
  onModify: () => void;
  onConfirm: () => void;
}

export function PreviewPanel({
  preview,
  isConfirming = false,
  confirmError,
  onReject,
  onModify,
  onConfirm,
}: PreviewPanelProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-violet-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
            {preview.title}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{preview.subtitle}</p>
      </header>

      <ReversibilityStatus
        reversibility={preview.reversibility}
        explanation={preview.reversibilityExplanation}
      />

      <ActionSummaryCard
        originalRequest={preview.originalRequest}
        requestedBy={preview.requestedBy}
        requestedAt={preview.requestedAt}
        summary={preview.summary}
        aiExplanation={preview.aiExplanation}
        aiExplanationNote={preview.aiExplanationNote}
        changesFromPreviousRequest={preview.changesFromPreviousRequest}
        proposedPlan={preview.proposedPlan}
      />

      <ActionTypeSection
        actionType={preview.actionType}
        apiOperations={preview.apiOperations}
      />

      <AffectedResourcesCard resources={preview.affectedResources} />

      <PreviewActions
        isConfirming={isConfirming}
        confirmError={confirmError}
        onReject={onReject}
        onModify={onModify}
        onConfirm={onConfirm}
      />
    </div>
  );
}
