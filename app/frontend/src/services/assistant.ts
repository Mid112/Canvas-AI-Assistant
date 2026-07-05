import { API_BASE_URL } from "@/config/api";
import { mapChatReply } from "@/lib/map-chat-reply";
import type { AssistantContext, AssistantResponse } from "@/types/chat";

export class AssistantApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AssistantApiError";
    this.status = status;
  }
}

interface ChatApiResponse {
  conversation_id: number;
  reply: Record<string, unknown>;
  is_error: boolean;
}

interface ChatRequestBody {
  message: string;
  local_course_id?: number;
  conversation_id?: number;
  pending_message_id?: number;
}

interface ConfirmActionBody {
  conversation_id: number;
  pending_message_id: number;
}

export interface SendAssistantMessageOptions {
  accessToken: string;
  context?: AssistantContext;
  conversationId?: number;
  pendingMessageId?: number;
}

export type AssistantChatResult = AssistantResponse & {
  conversationId: number;
};

async function parseError(response: Response): Promise<string> {
  if (response.status === 404) {
    return "The requested API endpoint was not found. Make sure the backend is running.";
  }

  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // Fall through to default message.
  }

  return "Something went wrong. Please try again.";
}

async function requestChat(
  path: string,
  accessToken: string,
  body: ChatRequestBody | ConfirmActionBody,
): Promise<ChatApiResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new AssistantApiError(await parseError(response), response.status);
  }

  return (await response.json()) as ChatApiResponse;
}

function toAssistantChatResult(
  apiResponse: ChatApiResponse,
  context: AssistantContext = {},
): AssistantChatResult {
  try {
    const mapped = mapChatReply(
      apiResponse.reply,
      apiResponse.is_error,
      context,
      apiResponse.conversation_id,
    );

    return {
      ...mapped,
      conversationId: apiResponse.conversation_id,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new AssistantApiError(error.message);
    }

    throw new AssistantApiError(
      "The assistant is temporarily unavailable. Please try again.",
    );
  }
}

export async function sendAssistantMessage(
  message: string,
  options: SendAssistantMessageOptions,
): Promise<AssistantChatResult> {
  const { accessToken, context = {}, conversationId, pendingMessageId } =
    options;

  const body: ChatRequestBody = { message };

  if (context.activeCourseId !== undefined) {
    body.local_course_id = context.activeCourseId;
  }
  if (conversationId !== undefined) {
    body.conversation_id = conversationId;
  }
  if (pendingMessageId !== undefined) {
    body.pending_message_id = pendingMessageId;
  }

  const apiResponse = await requestChat("/chat/", accessToken, body);
  return toAssistantChatResult(apiResponse, context);
}

export async function confirmAssistantAction(
  accessToken: string,
  conversationId: number,
  pendingMessageId: number,
  context: AssistantContext = {},
): Promise<AssistantChatResult> {
  const apiResponse = await requestChat("/chat/confirm", accessToken, {
    conversation_id: conversationId,
    pending_message_id: pendingMessageId,
  });

  return toAssistantChatResult(apiResponse, context);
}

export async function cancelAssistantAction(
  accessToken: string,
  conversationId: number,
  pendingMessageId: number,
  context: AssistantContext = {},
): Promise<AssistantChatResult> {
  const apiResponse = await requestChat("/chat/cancel", accessToken, {
    conversation_id: conversationId,
    pending_message_id: pendingMessageId,
  });

  return toAssistantChatResult(apiResponse, context);
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

export async function fetchConversation(
  accessToken: string,
  conversationId: number,
): Promise<ConversationResponse> {
  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/${conversationId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new AssistantApiError(await parseError(response), response.status);
  }

  return (await response.json()) as ConversationResponse;
}
