import { Eye } from "lucide-react";

import { PreviewBanner } from "@/components/brand/PreviewBanner";
import { ActionSummaryCard } from "@/components/preview/ActionSummaryCard";
import { ActionTypeSection } from "@/components/preview/ActionTypeSection";
import { AffectedResourcesCard } from "@/components/preview/AffectedResourcesCard";
import { EditableReviewForm } from "@/components/preview/EditableReviewForm";
import { PreviewActions } from "@/components/preview/PreviewActions";
import { ReversibilityStatus } from "@/components/preview/ReversibilityStatus";
import { RiskLevelIndicator } from "@/components/preview/RiskLevelIndicator";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

interface PreviewPanelProps {
  preview: DryRunPreviewData;
  isConfirming?: boolean;
  confirmError?: string | null;
  isSavingEdits?: boolean;
  saveEditsError?: string | null;
  onSaveEdits?: (changes: Record<string, unknown>) => void;
  onReject: () => void;
  onModify: () => void;
  onConfirm: () => void;
}

export function PreviewPanel({
  preview,
  isConfirming = false,
  confirmError,
  isSavingEdits = false,
  saveEditsError,
  onSaveEdits,
  onReject,
  onModify,
  onConfirm,
}: PreviewPanelProps) {
  return (
    <div className="space-y-6">
      <PreviewBanner />

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {preview.title}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{preview.subtitle}</p>
      </header>

      <div className="space-y-3">
        {preview.riskLevel ? (
          <RiskLevelIndicator riskLevel={preview.riskLevel} />
        ) : null}
        <ReversibilityStatus
          reversibility={preview.reversibility}
          explanation={preview.reversibilityExplanation}
        />
      </div>

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

      {onSaveEdits && preview.proposedPlan ? (
        <EditableReviewForm
          key={JSON.stringify(
            preview.proposedPlan.map((field) => [
              field.field,
              field.rawValue,
            ]),
          )}
          fields={preview.proposedPlan}
          error={saveEditsError}
          isSaving={isSavingEdits}
          onSave={onSaveEdits}
        />
      ) : null}

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
