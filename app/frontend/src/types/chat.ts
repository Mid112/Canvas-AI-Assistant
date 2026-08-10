import type { QuickActionId } from "@/lib/quick-actions";

export type ChatMessageRole = "user" | "assistant";

export type PendingActionStatus =
  | "pending"
  | "paused"
  | "executing"
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
    case "paused":
      return "paused";
    case "executing":
      return "executing";
    case "pending":
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
  state?: Record<string, unknown>;
}


export interface InterpretedAction {
  action: string;
  course: string;
  affectedStudents: string;
  technicalDetails?: Array<{ label: string; value: string }>;
  previewId?: string;
  primaryLink?: ActionLink;
  secondaryLink?: ActionLink;
  risk?: RiskMetadata;
}

export type RiskLevel = "low" | "medium" | "high";

export interface ConfirmationRequirement {
  type: "none" | "standard" | "strong";
  label: string;
  description: string;
  confirmation_phrase?: string;
}

export interface RiskMetadata {
  risk_level: RiskLevel;
  classification: string;
  requires_confirmation: boolean;
  confirmation_requirement: ConfirmationRequirement;
  destructive: boolean;
  reversible: boolean;
  undoable: boolean;
  can_undo: boolean;
  reversibility: string;
  warnings: string[];
  technical_details: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  conversationId?: number;
  pendingMessageId?: number;
  workflowId?: number;
  pendingActionStatus?: PendingActionStatus;
  /** Instructor-facing label for multi-workflow pause/resume/rename. */
  workflowDisplayName?: string | null;
  explanation?: string;
  acknowledgedFields?: Array<{ label: string; value: string }>;
  interpretedAction?: InterpretedAction;
  safetyBlocked?: boolean;
  safetyMessage?: string;
  requiresCanvasToken?: boolean;
  deferredRequestId?: number;
  /** True after the instructor dismisses a form-handoff offer (quiz /
   * message / feedback) so the action card and explanation hide. */
  handoffDismissed?: boolean;
  /** Canvas-fact claim types the backend found in this reply that no
   * Canvas read backed (e.g. ["grade"]). The reply text is shown intact;
   * this only drives a "not verified" notice, so the instructor can see a
   * made-up statistic for what it is rather than the number being
   * silently rewritten to "[grade redacted]" (bugs 12 and 13). */
  unverifiedClaims?: string[];
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
  acknowledgedFields?: Array<{ label: string; value: string }>;
  interpretedAction?: InterpretedAction;
  safetyBlocked?: boolean;
  safetyMessage?: string;
  requiresCanvasToken?: boolean;
  deferredRequestId?: number;
  /** See ChatMessage.unverifiedClaims. */
  unverifiedClaims?: string[];
  /** The course this turn actually resolved to, when the backend named one.
   *
   * Not always the active course: the assistant re-resolves the course from
   * the message itself, so "create an assignment ... for Capstone Project"
   * lands on Capstone Project even while another course is selected. The
   * assistant page reads this to move the chat tab to that course, so the
   * preview on screen and the tab it sits in cannot disagree. */
  resolvedCourse?: {
    localCourseId: number;
    courseName?: string;
  };
  /** When set, navigate to this route instead of showing a preview
   * card. The chat message content is still displayed. */
  navigateTo?: {
    path: string;
    state: Record<string, unknown>;
  };
  /** Explicitly keep a handoff in chat when the user must open it manually. */
  autoNavigate?: boolean;
  /** A single send_message turn can resolve to more than one distinct
   * message (different text per recipient, or an announcement plus
   * targeted messages) — the primary preview is this response itself;
   * every other resolved message is one more independently
   * confirmable/cancelable preview, shown alongside it. See
   * additional_previews in chat.py's _persist_additional_message_previews. */
  additionalPreviews?: AssistantResponse[];
}

/** A starter action on the assistant's empty chat. Carries no prompt of its
 * own: what the id does — open a creator page, or send a prompt — is resolved
 * through resolveQuickAction so this surface and the dashboard's Quick AI
 * Actions cannot drift apart under the same label. */
export interface SuggestedAction {
  id: QuickActionId;
  title: string;
  description: string;
}
