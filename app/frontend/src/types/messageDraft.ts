export interface MessageRecipient {
  id: string;
  name: string;
  email: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  description: string;
}

export interface MessageDraft {
  id: string;
  recipients: MessageRecipient[];
  subject: string;
  body: string;
  templateName?: string;
  templateId?: string;
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
