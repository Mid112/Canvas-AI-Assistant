export interface MessageRecipient {
  id: string;
  name: string;
  email: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  description: string;
  /** Full template body from the backend (optional for legacy mock shapes). */
  content?: string;
  courseId?: number | null;
}

export interface MessageDraft {
  id: string;
  recipients: MessageRecipient[];
  subject: string;
  body: string;
  templateName?: string;
  templateId?: string;
}

/** Outbound sent draft row for the Messages Sent tab. */
export interface SentMessageDraft {
  id: string;
  courseId: number | null;
  subject: string;
  body: string;
  recipients: MessageRecipient[];
  status: string;
  sentAt: string | null;
  deliveryMode: "announcement" | "conversation" | null;
  createdAt: string;
  updatedAt: string;
}

export interface FetchMessageDraftOptions {
  draftId?: number;
  courseId?: number;
  templateId?: string;
  templateName?: string;
  prompt?: string;
  /** Prefill from an AI assistant send_message proposal. */
  subject?: string;
  body?: string;
  recipients?: MessageRecipient[];
  /** When set, only these IDs start checked; the full roster stays visible. */
  preSelectedIds?: string[];
  emptyRecipients?: boolean;
  simulateLoadError?: boolean;
  conversationId?: number;
  /** Canvas base URL resolved from the selected course or institution. */
  canvasUrl?: string;
}

export interface SendMessageDraftPayload {
  draftId: string;
  subject: string;
  body: string;
  recipientIds: string[];
  recipients?: MessageRecipient[];
  conversationId?: number;
  canvasUrl?: string;
}

export type MessageDraftPageState =
  | "loading"
  | "editing"
  | "sending"
  | "success";
