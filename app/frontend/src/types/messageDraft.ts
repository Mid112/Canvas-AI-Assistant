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
  emptyRecipients?: boolean;
  simulateLoadError?: boolean;
}

export interface SendMessageDraftPayload {
  draftId: string;
  subject: string;
  body: string;
  recipientIds: string[];
  recipients?: MessageRecipient[];
}

export type MessageDraftPageState =
  | "loading"
  | "editing"
  | "sending"
  | "success";
