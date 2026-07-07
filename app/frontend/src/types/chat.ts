export type ChatMessageRole = "user" | "assistant";

export type PendingActionStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "superseded";

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
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
