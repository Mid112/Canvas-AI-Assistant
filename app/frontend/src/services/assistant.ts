import { apiRequest, ApiRequestError } from "@/lib/api-request";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import type { AssistantContext, AssistantResponse } from "@/types/chat";

export class AssistantApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AssistantApiError";
    this.status = status;
  }
}

export interface SendAssistantMessageOptions {
  conversationId?: number;
  localCourseId?: number;
  pendingMessageId?: number;
  context?: AssistantContext;
}

export interface AssistantMessageResult extends AssistantResponse {
  conversationId: number;
  pendingMessageId?: number;
}

export type AssistantChatResult = AssistantMessageResult;

interface ChatApiResponse {
  conversation_id: number;
  reply: Record<string, unknown>;
  is_error: boolean;
}

export interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationResponse {
  id: number;
  course_id: number | null;
  created_at: string;
  messages: ConversationMessage[];
}

function toAssistantMessageResult(
  response: ChatApiResponse,
): AssistantMessageResult {
  const mapped = mapChatReplyToAssistantResponse(
    response.reply,
    response.is_error,
  );

  return {
    ...mapped,
    conversationId: response.conversation_id,
    pendingMessageId:
      typeof response.reply.pending_message_id === "number"
        ? response.reply.pending_message_id
        : mapped.pendingMessageId,
  };
}

function wrapRequestError(error: unknown): never {
  if (error instanceof ApiRequestError) {
    throw new AssistantApiError(error.message, error.status);
  }

  throw new AssistantApiError(
    error instanceof Error
      ? error.message
      : "The assistant is temporarily unavailable. Please try again.",
  );
}

export async function sendAssistantMessage(
  accessToken: string,
  message: string,
  options: SendAssistantMessageOptions = {},
): Promise<AssistantMessageResult> {
  const context = options.context ?? {};
  const localCourseId = options.localCourseId ?? context.activeCourseId;

  try {
    const response = await apiRequest<ChatApiResponse>("/chat/", accessToken, {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
        local_course_id: localCourseId,
        pending_message_id: options.pendingMessageId,
      }),
    });

    return toAssistantMessageResult(response);
  } catch (error) {
    wrapRequestError(error);
  }
}

export async function confirmAssistantAction(
  accessToken: string,
  conversationId: number,
  pendingMessageId: number,
): Promise<AssistantMessageResult> {
  try {
    const response = await apiRequest<ChatApiResponse>(
      "/chat/confirm",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          pending_message_id: pendingMessageId,
        }),
      },
    );

    return toAssistantMessageResult(response);
  } catch (error) {
    wrapRequestError(error);
  }
}

export async function cancelAssistantAction(
  accessToken: string,
  conversationId: number,
  pendingMessageId: number,
): Promise<AssistantMessageResult> {
  try {
    const response = await apiRequest<ChatApiResponse>(
      "/chat/cancel",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          pending_message_id: pendingMessageId,
        }),
      },
    );

    return toAssistantMessageResult(response);
  } catch (error) {
    wrapRequestError(error);
  }
}

export async function fetchConversation(
  accessToken: string,
  conversationId: number,
): Promise<ConversationResponse> {
  try {
    return await apiRequest<ConversationResponse>(
      `/chat/conversations/${conversationId}`,
      accessToken,
    );
  } catch (error) {
    wrapRequestError(error);
  }
}
