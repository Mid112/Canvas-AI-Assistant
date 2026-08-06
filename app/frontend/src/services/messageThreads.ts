// Frontend service note: wraps message threads API calls and normalizes payloads for route/components.

import { apiRequest, ApiRequestError } from "@/lib/api-request";
import type {
  MessageThread,
  MessageThreadListResult,
  MessageThreadParticipant,
  MessageThreadReply,
} from "@/types/messageThread";

const INBOX_PATH = "/messages/inbox";

export class MessageThreadsApiError extends ApiRequestError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "MessageThreadsApiError";
  }
}

interface ApiParticipant {
  id: string;
  name: string;
  role: string;
}

interface ApiMessage {
  id: string;
  author: ApiParticipant;
  body: string;
  sent_at: string;
}

interface ApiThreadSummary {
  id: string;
  course_id: number | null;
  course_name: string;
  subject: string;
  preview: string;
  participants: ApiParticipant[];
  unread_count: number;
  updated_at: string;
}

interface ApiThreadDetail extends ApiThreadSummary {
  messages: ApiMessage[];
}

interface ApiThreadListResponse {
  threads: ApiThreadSummary[];
}

function toParticipantRole(role: string): MessageThreadParticipant["role"] {
  return role === "instructor" ? "instructor" : "student";
}

function mapParticipant(participant: ApiParticipant): MessageThreadParticipant {
  return {
    id: participant.id,
    name: participant.name,
    role: toParticipantRole(participant.role),
  };
}

function mapMessage(message: ApiMessage): MessageThreadReply {
  return {
    id: message.id,
    author: mapParticipant(message.author),
    body: message.body,
    sentAt: message.sent_at,
  };
}

function mapSummary(thread: ApiThreadSummary): MessageThread {
  return {
    id: thread.id,
    courseId: thread.course_id ?? 0,
    courseName: thread.course_name,
    subject: thread.subject,
    preview: thread.preview,
    participants: thread.participants.map(mapParticipant),
    messages: [],
    unreadCount: thread.unread_count,
    updatedAt: thread.updated_at,
  };
}

function mapDetail(thread: ApiThreadDetail): MessageThread {
  return {
    ...mapSummary(thread),
    messages: thread.messages.map(mapMessage),
  };
}

function buildQuery(courseId?: number, canvasUrl?: string): string {
  const params = new URLSearchParams();
  if (courseId != null) {
    params.set("course_id", String(courseId));
  }
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function toApiError(error: unknown, fallback: string): MessageThreadsApiError {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof ApiRequestError ? error.status : 0;
  return new MessageThreadsApiError(message, status);
}

/** Lists the instructor's Canvas inbox threads, optionally scoped to a course. */
export async function fetchMessageThreads(
  accessToken: string,
  courseId?: number,
  canvasUrl?: string,
): Promise<MessageThreadListResult> {
  try {
    const data = await apiRequest<ApiThreadListResponse>(
      `${INBOX_PATH}${buildQuery(courseId, canvasUrl)}`,
      accessToken,
    );
    return { threads: data.threads.map(mapSummary) };
  } catch (error) {
    throw toApiError(error, "Unable to load messages.");
  }
}

/** Fetches a single conversation with its full message history. */
export async function fetchMessageThread(
  accessToken: string,
  threadId: string,
  courseId?: number,
  canvasUrl?: string,
): Promise<MessageThread> {
  try {
    const data = await apiRequest<ApiThreadDetail>(
      `${INBOX_PATH}/${threadId}${buildQuery(courseId, canvasUrl)}`,
      accessToken,
    );
    return mapDetail(data);
  } catch (error) {
    throw toApiError(error, "Unable to load this conversation.");
  }
}

/** Sends a reply to a conversation and returns the updated thread. */
export async function replyToMessageThread(
  accessToken: string,
  threadId: string,
  body: string,
  courseId?: number,
  canvasUrl?: string,
): Promise<MessageThread> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new MessageThreadsApiError("Reply cannot be empty.", 0);
  }
  try {
    const data = await apiRequest<ApiThreadDetail>(
      `${INBOX_PATH}/${threadId}/reply${buildQuery(courseId, canvasUrl)}`,
      accessToken,
      { method: "POST", body: JSON.stringify({ body: trimmed }) },
    );
    return mapDetail(data);
  } catch (error) {
    throw toApiError(error, "Unable to send reply.");
  }
}

interface ApiReplyDraftResponse {
  body: string;
}

interface ApiReplyPreviewResponse {
  summary: string;
  recipient_count: number;
  body_preview: string;
}

/** Generates an AI-assisted reply draft for a conversation thread. */
export async function generateInboxReplyDraft(
  accessToken: string,
  threadId: string,
  courseId?: number,
  canvasUrl?: string,
  prompt?: string,
): Promise<string> {
  try {
    const data = await apiRequest<ApiReplyDraftResponse>(
      `${INBOX_PATH}/${threadId}/generate-reply-draft${buildQuery(courseId, canvasUrl)}`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ prompt: prompt ?? null }),
      },
    );
    return data.body;
  } catch (error) {
    throw toApiError(error, "Unable to generate a reply draft.");
  }
}

/** Previews a reply before sending it to Canvas. */
export async function previewInboxReply(
  accessToken: string,
  threadId: string,
  body: string,
  courseId?: number,
  canvasUrl?: string,
): Promise<{ summary: string; recipientCount: number; bodyPreview: string }> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new MessageThreadsApiError("Reply cannot be empty.", 0);
  }
  try {
    const data = await apiRequest<ApiReplyPreviewResponse>(
      `${INBOX_PATH}/${threadId}/reply/preview${buildQuery(courseId, canvasUrl)}`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      },
    );
    return {
      summary: data.summary,
      recipientCount: data.recipient_count,
      bodyPreview: data.body_preview,
    };
  } catch (error) {
    throw toApiError(error, "Unable to preview this reply.");
  }
}
