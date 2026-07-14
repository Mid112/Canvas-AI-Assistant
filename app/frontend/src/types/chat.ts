export type ChatMessageRole = "user" | "assistant";

export type PendingActionStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "superseded"
  | "failed";

/** Maps a Workflow.status value from the backend (see WorkflowStatus in
 * app/backend/app/schemas/chat.py) to this app's PendingActionStatus.
 * Authoritative: call sites should prefer this over any transcript-based
 * reconstruction, since ConversationResponse.workflow_statuses is now the
 * single source of truth for a preview card's real state, keyed by
 * preview_message_id — it can't be mislabeled by out-of-order
 * confirm/cancel the way FIFO-guessing from "[confirmed action]"/
 * "[cancelled action]" marker text could be. */
export function mapWorkflowStatus(
  backendStatus: string | undefined,
): PendingActionStatus {
  switch (backendStatus) {
    case "executed":
      return "confirmed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "superseded":
      return "superseded";
    case "pending":
    case "executing":
    default:
      // No workflow row found yet, or a genuinely open/mid-confirm
      // preview — same fallback the previous FIFO-based reconstruction
      // used for "nothing settled this preview yet".
      return "pending";
  }
}

export interface ActionLink {
  label: string;
  href: string;
}

export interface InterpretedAction {
  action: string;
  course: string;
  affectedStudents: string;
  previewId?: string;
  primaryLink?: ActionLink;
  secondaryLink?: ActionLink;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  conversationId?: number;
  pendingMessageId?: number;
  pendingActionStatus?: PendingActionStatus;
  explanation?: string;
  interpretedAction?: InterpretedAction;
  safetyBlocked?: boolean;
  safetyMessage?: string;
}

export interface AssistantContext {
  activeCourseLabel?: string;
  activeCourseId?: number;
}

export interface AssistantResponse {
  content: string;
  conversationId?: number;
  pendingMessageId?: number;
  explanation?: string;
  interpretedAction?: InterpretedAction;
  safetyBlocked?: boolean;
  safetyMessage?: string;
  /** A single send_message turn can resolve to more than one distinct
   * message (different text per recipient, or an announcement plus
   * targeted messages) — the primary preview is this response itself;
   * every other resolved message is one more independently
   * confirmable/cancelable preview, shown alongside it. See
   * additional_previews in chat.py's _persist_additional_message_previews. */
  additionalPreviews?: AssistantResponse[];
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
