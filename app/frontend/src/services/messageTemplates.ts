import { apiRequest } from "@/lib/api-request";
import type { MessageTemplate } from "@/types/messageDraft";

export class MessageTemplateApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageTemplateApiError";
  }
}

interface MessageTemplateApiResponse {
  id: number;
  title: string;
  content: string;
  course_id: number | null;
  created_at: string;
}

export function mapMessageTemplateResponse(
  response: MessageTemplateApiResponse,
): MessageTemplate {
  const description =
    response.content.length > 120
      ? `${response.content.slice(0, 117)}...`
      : response.content;

  return {
    id: String(response.id),
    name: response.title,
    description,
    content: response.content,
    courseId: response.course_id,
  };
}

export async function listMessageTemplates(
  accessToken: string,
  courseId?: number | null,
): Promise<MessageTemplate[]> {
  const query =
    courseId !== undefined && courseId !== null
      ? `?course_id=${encodeURIComponent(String(courseId))}`
      : "";
  const rows = await apiRequest<MessageTemplateApiResponse[]>(
    `/message-templates/${query}`,
    accessToken,
  );
  return rows.map(mapMessageTemplateResponse);
}

export async function createMessageTemplate(
  accessToken: string,
  payload: { title: string; content: string; courseId?: number | null },
): Promise<MessageTemplate> {
  const response = await apiRequest<MessageTemplateApiResponse>(
    "/message-templates/",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        content: payload.content,
        course_id: payload.courseId ?? null,
      }),
    },
  );
  return mapMessageTemplateResponse(response);
}

export async function updateMessageTemplate(
  accessToken: string,
  templateId: string,
  payload: { title?: string; content?: string; courseId?: number | null },
): Promise<MessageTemplate> {
  const response = await apiRequest<MessageTemplateApiResponse>(
    `/message-templates/${templateId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title,
        content: payload.content,
        course_id: payload.courseId,
      }),
    },
  );
  return mapMessageTemplateResponse(response);
}

export async function deleteMessageTemplate(
  accessToken: string,
  templateId: string,
): Promise<void> {
  await apiRequest<void>(`/message-templates/${templateId}`, accessToken, {
    method: "DELETE",
  });
}
