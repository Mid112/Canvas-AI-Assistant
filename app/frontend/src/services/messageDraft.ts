import { apiRequest } from "@/lib/api-request";
import type {
  FetchMessageDraftOptions,
  MessageDraft,
  MessageRecipient,
  SendMessageDraftPayload,
  SentMessageDraft,
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
  delivery_mode?: string | null;
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

function mapSentDraftResponse(response: MessageDraftApiResponse): SentMessageDraft {
  const deliveryMode =
    response.delivery_mode === "announcement" ||
    response.delivery_mode === "conversation"
      ? response.delivery_mode
      : response.recipients.length === 0
        ? "announcement"
        : "conversation";

  return {
    id: String(response.id),
    courseId: response.course_id,
    subject: response.subject,
    body: response.body,
    recipients: response.recipients,
    status: response.status,
    sentAt: response.sent_at,
    deliveryMode,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
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

export async function fetchSentMessageDrafts(
  accessToken: string,
  options: { courseId?: number } = {},
): Promise<SentMessageDraft[]> {
  try {
    const params = new URLSearchParams({ status: "sent" });
    if (options.courseId != null) {
      params.set("course_id", String(options.courseId));
    }
    const response = await apiRequest<MessageDraftApiResponse[]>(
      `/messages/drafts?${params.toString()}`,
      accessToken,
    );
    return response.map(mapSentDraftResponse);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load sent messages.";
    throw new MessageDraftApiError(message);
  }
}

export async function sendMessageDraft(
  accessToken: string,
  payload: SendMessageDraftPayload,
): Promise<void> {
  const selectedRecipients = payload.recipients ?? [];

  // Keep recipientIds and recipient objects in lockstep. For announcements
  // both must be empty, otherwise stale private recipients could be PATCHed
  // onto a draft that the UI intends to send course-wide.
  if (
    selectedRecipients.length !== payload.recipientIds.length ||
    selectedRecipients.some(
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
          // accidentally send to the originally loaded full roster. An empty
          // list intentionally posts a course announcement.
          recipients: selectedRecipients,
        }),
      },
    );

    const params = new URLSearchParams();
    if (payload.conversationId != null) {
      params.set("conversation_id", String(payload.conversationId));
    }
    if (payload.canvasUrl) {
      params.set("canvas_url", payload.canvasUrl);
    }

    const query = params.toString();
    const sendPath = `/messages/drafts/${payload.draftId}/send${query ? `?${query}` : ""}`;

    await apiRequest(sendPath, accessToken, {
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
