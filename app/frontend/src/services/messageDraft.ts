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

function mapDraftResponse(
  response: MessageDraftApiResponse,
  fallbackRecipients: MessageRecipient[] = [],
): MessageDraft {
  // The backend may create an empty draft while the course page has already
  // loaded recipients from Canvas/submission fallback. Preserve those local
  // recipients so the UI does not briefly lose its selected student list.
  const recipients =
    response.recipients.length > 0 ? response.recipients : fallbackRecipients;

  return {
    id: String(response.id),
    recipients,
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
  const subject =
    options.subject?.trim() || `${templateName}: Course Update`;
  const body = options.body?.trim() || prompt;

  return {
    course_id: options.courseId ?? null,
    template_id: options.templateId ?? "assignment-reminder",
    template_name: templateName,
    // When subject/body are already provided by the AI assistant, skip
    // re-prompting the draft LLM by omitting `prompt`.
    prompt: options.subject?.trim() && options.body?.trim() ? undefined : prompt,
    subject,
    body,
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

    return mapDraftResponse(
      created,
      options.emptyRecipients ? [] : (options.recipients ?? []),
    );
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

  if (
    !payload.recipients ||
    payload.recipients.length !== payload.recipientIds.length ||
    payload.recipients.some(
      (recipient) => !payload.recipientIds.includes(recipient.id),
    )
  ) {
    // Sending uses the stored draft recipients on the backend. If the UI has
    // ids but not matching recipient objects, PATCH would persist the wrong
    // target set and could send to stale recipients.
    throw new MessageDraftApiError(
      "Selected recipient details are out of sync. Please reload the draft and try again.",
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
          // The backend sends whatever recipients are stored on the draft.
          // Persist the UI selection first so sending one student does not
          // accidentally send to the originally loaded full roster.
          recipients: payload.recipients,
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
