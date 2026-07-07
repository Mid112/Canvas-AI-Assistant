import { apiRequest } from "@/lib/api-request";
import type {
  FetchMessageDraftOptions,
  MessageDraft,
  MessageRecipient,
  SendMessageDraftPayload,
} from "@/types/messageDraft";

export const isMessageDraftSendMocked = false;

export class MessageDraftApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageDraftApiError";
  }
}

interface MessageDraftApiResponse {
  id: number;
  course_id: number | null;
  subject: string;
  body: string;
  template_id: string | null;
  template_name: string | null;
  recipients: MessageRecipient[];
  status: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapDraftResponse(response: MessageDraftApiResponse): MessageDraft {
  return {
    id: String(response.id),
    recipients: response.recipients,
    subject: response.subject,
    body: response.body,
    templateName: response.template_name ?? undefined,
    templateId: response.template_id ?? undefined,
  };
}

function buildCreatePayload(options: FetchMessageDraftOptions) {
  const recipients = options.emptyRecipients ? [] : (options.recipients ?? []);
  const prompt =
    options.prompt ??
    "Draft a friendly reminder about an upcoming assignment deadline.";
  const templateName = options.templateName ?? "Assignment Reminder";

  return {
    course_id: options.courseId ?? null,
    template_id: options.templateId ?? "assignment-reminder",
    template_name: templateName,
    prompt,
    subject: `${templateName}: Course Update`,
    // Providing starter content keeps this route responsive when the
    // backend is configured with a slow local model. The instructor can
    // still edit the draft before sending.
    body: prompt,
    recipients,
  };
}

export async function fetchMessageDraft(
  accessToken: string,
  options: FetchMessageDraftOptions = {},
): Promise<MessageDraft> {
  if (options.simulateLoadError) {
    throw new MessageDraftApiError(
      "Unable to load message draft. Please try again.",
    );
  }

  try {
    if (options.draftId) {
      const response = await apiRequest<MessageDraftApiResponse>(
        `/messages/drafts/${options.draftId}`,
        accessToken,
      );
      return mapDraftResponse(response);
    }

    const created = await apiRequest<MessageDraftApiResponse>(
      "/messages/drafts",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify(buildCreatePayload(options)),
      },
    );

    return mapDraftResponse(created);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load message draft. Please try again.";

    throw new MessageDraftApiError(message);
  }
}

export async function sendMessageDraft(
  accessToken: string,
  payload: SendMessageDraftPayload,
): Promise<void> {
  if (payload.recipientIds.length === 0) {
    throw new MessageDraftApiError(
      "At least one recipient is required to send a message.",
    );
  }

  try {
    await apiRequest<MessageDraftApiResponse>(
      `/messages/drafts/${payload.draftId}`,
      accessToken,
      {
        method: "PATCH",
        body: JSON.stringify({
          subject: payload.subject,
          body: payload.body,
        }),
      },
    );

    await apiRequest(`/messages/drafts/${payload.draftId}/send`, accessToken, {
      method: "POST",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to send message. Canvas messaging is temporarily unavailable.";

    throw new MessageDraftApiError(message);
  }
}
