import {
  emptyRecipientsMessageDraft,
  mockMessageDraft,
} from "@/data/mockMessageDraft";
import type {
  FetchMessageDraftOptions,
  MessageDraft,
  SendMessageDraftPayload,
} from "@/types/messageDraft";

export class MessageDraftApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageDraftApiError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function randomDelayMs(): number {
  return 800 + Math.floor(Math.random() * 600);
}

/** Placeholder mock — replace with real backend when available. */
export async function fetchMessageDraft(
  options: FetchMessageDraftOptions = {},
): Promise<MessageDraft> {
  await delay(randomDelayMs());

  if (options.simulateLoadError) {
    throw new MessageDraftApiError(
      "Unable to load message draft. Please try again.",
    );
  }

  const source = options.emptyRecipients
    ? emptyRecipientsMessageDraft
    : mockMessageDraft;

  return {
    ...source,
    recipients: [...source.recipients],
  };
}

/** Placeholder mock — simulates sending a Canvas message. */
export async function sendMessageDraft(
  payload: SendMessageDraftPayload,
): Promise<void> {
  await delay(1000);

  if (payload.subject.toLowerCase().includes("fail")) {
    throw new MessageDraftApiError(
      "Unable to send message. Canvas messaging is temporarily unavailable.",
    );
  }

  if (payload.recipientIds.length === 0) {
    throw new MessageDraftApiError(
      "At least one recipient is required to send a message.",
    );
  }
}
