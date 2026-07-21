import { apiRequest, ApiRequestError } from "@/lib/api-request";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import type {
  AssistantContext,
  AssistantResponse,
  ChatMessage,
  PendingActionStatus,
} from "@/types/chat";
import type { LlmProviderSettings } from "@/types/llmProvider";

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
  modelSettings?: LlmProviderSettings;
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
  pending_action_status?: string | null;
}

/** Mirrors WorkflowStatus in app/backend/app/schemas/chat.py — the
 * authoritative lifecycle state of one proposed action, independent of
 * transcript text. */
export interface WorkflowStatusEntry {
  workflow_id: number;
  status: string;
  action_name: string;
  result_message_id: number | null;
}

export interface ConversationResponse {
  id: number;
  course_id: number | null;
  created_at: string;
  messages: ConversationMessage[];
  /** Keyed by preview_message_id — see WorkflowStatusEntry. */
  workflow_statuses: Record<number, WorkflowStatusEntry>;
}

export interface ConversationSummary {
  id: number;
  course_id: number | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string | null;
  pending_action_count: number;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  total: number;
}

export interface ListConversationsOptions {
  limit?: number;
  offset?: number;
}

function toAssistantMessageResult(
  response: ChatApiResponse,
): AssistantMessageResult {
  const mapped = mapChatReplyToAssistantResponse(
    response.reply,
    response.is_error,
    response.conversation_id,
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

function parseStoredAssistantContent(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mapWorkflowStatus(
  status: string | null | undefined,
): PendingActionStatus | undefined {
  switch (status) {
    case "pending":
      return "pending";
    case "executing":
      return "executing";
    case "executed":
      return "confirmed";
    case "cancelled":
      return "cancelled";
    case "superseded":
      return "superseded";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}

export function mapConversationToChatMessages(
  conversation: ConversationResponse,
): ChatMessage[] {
  return conversation.messages.flatMap((message): ChatMessage[] => {
    const timestamp = new Date(message.created_at);

    if (message.role === "assistant") {
      const parsed = parseStoredAssistantContent(message.content);
      const reply =
        parsed?.intent_preview && parsed.pending_message_id === undefined
          ? { ...parsed, pending_message_id: message.id }
          : parsed;
      const mapped = reply
        ? mapChatReplyToAssistantResponse(reply, false, conversation.id)
        : { content: message.content };
      const pendingActionStatus = mapWorkflowStatus(
        message.pending_action_status,
      ) ?? (reply?.intent_preview ? "pending" : undefined);
      const pendingMessageId =
        pendingActionStatus ? message.id : undefined;

      return [{
        id: `stored-${message.id}`,
        role: "assistant",
        content: mapped.content,
        timestamp,
        conversationId: conversation.id,
        pendingMessageId,
        pendingActionStatus,
        explanation: mapped.explanation,
        interpretedAction: mapped.interpretedAction,
        safetyBlocked: mapped.safetyBlocked,
        safetyMessage: mapped.safetyMessage,
      }];
    }

    if (
      message.content === "[confirmed action]" ||
      message.content === "[cancelled action]"
    ) {
      return [];
    }

    return [{
      id: `stored-${message.id}`,
      role: "user",
      content: message.content,
      timestamp,
      conversationId: conversation.id,
    }];
  });
}

export async function sendAssistantMessage(
  accessToken: string,
  message: string,
  options: SendAssistantMessageOptions = {},
): Promise<AssistantMessageResult> {
  const context = options.context ?? {};
  const localCourseId = options.localCourseId ?? context.activeCourseId;
  const modelSettings = options.modelSettings;

  try {
    const response = await apiRequest<ChatApiResponse>("/chat/", accessToken, {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
        local_course_id: localCourseId,
        pending_message_id: options.pendingMessageId,
        model_settings: modelSettings
          ? {
              provider: modelSettings.provider,
              model: modelSettings.model || undefined,
              base_url: modelSettings.baseUrl || undefined,
            }
          : undefined,
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

export async function listAssistantConversations(
  accessToken: string,
  options: ListConversationsOptions = {},
): Promise<ConversationListResponse> {
  const params = new URLSearchParams();

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  const query = params.toString();

  try {
    return await apiRequest<ConversationListResponse>(
      `/chat/conversations${query ? `?${query}` : ""}`,
      accessToken,
    );
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

export interface DeferredAssistantRequest {
  id: number;
  conversation_id: number | null;
  message: string;
  proposed_action: Record<string, unknown> | null;
  status: string;
  created_at: string;
  resumed_at: string | null;
}

export interface DeferredAssistantRequestList {
  items: DeferredAssistantRequest[];
}

export async function listDeferredAssistantRequests(
  accessToken: string,
): Promise<DeferredAssistantRequestList> {
  try {
    return await apiRequest<DeferredAssistantRequestList>(
      "/chat/deferred",
      accessToken,
    );
  } catch (error) {
    wrapRequestError(error);
  }
}

export async function resumeDeferredAssistantRequest(
  accessToken: string,
  deferredId: number,
): Promise<DeferredAssistantRequest> {
  try {
    return await apiRequest<DeferredAssistantRequest>(
      `/chat/deferred/${deferredId}/resume`,
      accessToken,
      { method: "POST" },
    );
  } catch (error) {
    wrapRequestError(error);
  }
}
