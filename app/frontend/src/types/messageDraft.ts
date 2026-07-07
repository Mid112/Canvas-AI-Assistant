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
  templateId?: string;
  templateName?: string;
  prompt?: string;
  emptyRecipients?: boolean;
  simulateLoadError?: boolean;
}

export interface SendMessageDraftPayload {
  draftId: string;
  subject: string;
  body: string;
  recipientIds: string[];
}

export type MessageDraftPageState =
  | "loading"
  | "editing"
  | "sending"
  | "success";
