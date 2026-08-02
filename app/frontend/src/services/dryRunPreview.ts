import {
  defaultDryRunPreviewId,
  mockDryRunPreviews,
} from "@/data/mockDryRunPreview";
import { mapIntentPreviewToDryRun } from "@/lib/map-intent-preview-to-dry-run";
import { fetchConversation } from "@/services/assistant";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

const MOCK_LOAD_DELAY_MS = 600;

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

export async function fetchChatIntentPreview(
  accessToken: string,
  conversationId: number,
  pendingMessageId: number,
  requestedBy: string,
): Promise<DryRunPreviewData> {
  const conversation = await fetchConversation(accessToken, conversationId);
  return mapIntentPreviewToDryRun(
    conversationId,
    pendingMessageId,
    conversation.messages,
    requestedBy,
  );
}

export async function confirmDryRunPreview(
  _previewId: string,
): Promise<{ success: true; message: string }> {
  // Ticket 38: mock/?preview= demos must not claim Canvas execution. Real
  // confirms go through confirmAssistantAction on the chat preview path.
  throw new DryRunPreviewError(
    "This demo preview cannot execute Canvas actions. Approve a preview from the assistant chat instead.",
  );
}
