import {
  defaultDryRunPreviewId,
  mockDryRunPreviews,
} from "@/data/mockDryRunPreview";
import { recordActionHistoryEntry } from "@/services/actionHistory";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

const MOCK_LOAD_DELAY_MS = 600;
const MOCK_CONFIRM_DELAY_MS = 1200;

export class DryRunPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DryRunPreviewError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getCourseLabel(preview: DryRunPreviewData): string {
  return preview.affectedResources.course.name;
}

export async function fetchDryRunPreview(
  previewId: string = defaultDryRunPreviewId,
): Promise<DryRunPreviewData> {
  await delay(MOCK_LOAD_DELAY_MS);

  if (previewId === "empty") {
    throw new DryRunPreviewError("No preview is available for this workflow.");
  }

  if (previewId === "error") {
    throw new DryRunPreviewError("Unable to load the workflow preview. Please try again.");
  }

  const preview = mockDryRunPreviews[previewId];

  if (!preview) {
    throw new DryRunPreviewError("Workflow preview not found.");
  }

  return preview;
}

export async function confirmDryRunPreview(
  previewId: string,
): Promise<{ success: true; message: string }> {
  await delay(MOCK_CONFIRM_DELAY_MS);

  if (previewId === "confirm-error") {
    throw new DryRunPreviewError("Unable to approve this workflow. Please try again.");
  }

  const preview = mockDryRunPreviews[previewId];

  if (preview) {
    await recordActionHistoryEntry({
      originalRequest: preview.originalRequest,
      actionType: preview.actionType,
      courseLabel: getCourseLabel(preview),
      status: "approved",
      requestedAt: preview.requestedAt,
      requestedBy: preview.requestedBy,
    });
  }

  return {
    success: true,
    message: "Workflow approved. Canvas actions will be executed shortly.",
  };
}
