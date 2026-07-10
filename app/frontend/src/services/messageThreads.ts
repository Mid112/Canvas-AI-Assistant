import { mockMessageThreads } from "@/data/mockMessageThreads";
import type {
  MessageThread,
  MessageThreadListResult,
  MessageThreadReply,
} from "@/types/messageThread";

const STORAGE_KEY = "canvas-workflow-message-threads";

function cloneThreads(threads: MessageThread[]): MessageThread[] {
  return structuredClone(threads);
}

function readStoredThreads(): MessageThread[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as MessageThread[];
  } catch {
    return null;
  }
}

function writeStoredThreads(threads: MessageThread[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function getThreads(): MessageThread[] {
  return readStoredThreads() ?? cloneThreads(mockMessageThreads);
}

/** Lists instructor message threads (mock-backed until Canvas inbox APIs exist). */
export async function fetchMessageThreads(
  _accessToken: string,
  courseId?: number,
): Promise<MessageThreadListResult> {
  const threads = getThreads().filter((thread) =>
    courseId == null ? true : thread.courseId === courseId,
  );
  return {
    threads: [...threads].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}

export async function fetchMessageThread(
  _accessToken: string,
  threadId: string,
): Promise<MessageThread | null> {
  return getThreads().find((thread) => thread.id === threadId) ?? null;
}

export async function replyToMessageThread(
  _accessToken: string,
  threadId: string,
  body: string,
): Promise<MessageThread> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Reply cannot be empty.");
  }

  const threads = getThreads();
  const index = threads.findIndex((thread) => thread.id === threadId);
  if (index < 0) {
    throw new Error("Message thread not found.");
  }

  const reply: MessageThreadReply = {
    id: `msg-${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`,
    author: { id: "instructor-1", name: "You", role: "instructor" },
    body: trimmed,
    sentAt: new Date().toISOString(),
  };

  const current = threads[index]!;
  const updated: MessageThread = {
    ...current,
    messages: [...current.messages, reply],
    preview: trimmed,
    unreadCount: 0,
    updatedAt: reply.sentAt,
  };

  const next = [...threads];
  next[index] = updated;
  writeStoredThreads(next);
  return updated;
}

export function getStudentReplies(thread: MessageThread): MessageThreadReply[] {
  return thread.messages.filter((message) => message.author.role === "student");
}
