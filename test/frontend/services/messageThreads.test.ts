// Test note: covers the message threads.test behavior so future changes can preserve the expected Canvas workflow contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchMessageThread,
  fetchMessageThreads,
  MessageThreadsApiError,
  replyToMessageThread,
} from "@/services/messageThreads";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const summaryResponse = {
  threads: [
    {
      id: "5",
      course_id: 7,
      course_name: "COSC 499",
      subject: "Question about A3",
      preview: "Is the deadline extended?",
      participants: [
        { id: "500", name: "Prof", role: "instructor" },
        { id: "101", name: "Alice", role: "student" },
      ],
      unread_count: 1,
      updated_at: "2026-03-01T00:00:00.000Z",
    },
  ],
};

const detailResponse = {
  id: "5",
  course_id: 7,
  course_name: "COSC 499",
  subject: "Question about A3",
  preview: "Thanks!",
  participants: [
    { id: "500", name: "Prof", role: "instructor" },
    { id: "101", name: "Alice", role: "student" },
  ],
  unread_count: 0,
  updated_at: "2026-03-02T00:00:00.000Z",
  messages: [
    {
      id: "19",
      author: { id: "101", name: "Alice", role: "student" },
      body: "Is the deadline extended?",
      sent_at: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "20",
      author: { id: "500", name: "Prof", role: "instructor" },
      body: "Thanks!",
      sent_at: "2026-03-02T00:00:00.000Z",
    },
  ],
};

describe("messageThreads service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies: Lists threads with course scope + canvas_url query params.
  it("fetches inbox threads scoped to a course", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(summaryResponse), { status: 200 }),
    );

    const result = await fetchMessageThreads(
      "token",
      7,
      "http://localhost:3000",
    );

    const requestedUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/messages/inbox?");
    expect(requestedUrl).toContain("course_id=7");
    expect(requestedUrl).toContain("canvas_url=http");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]?.courseId).toBe(7);
    expect(result.threads[0]?.unreadCount).toBe(1);
    expect(result.threads[0]?.messages).toEqual([]);
  });

  // Verifies: Omits course_id when no course is provided (all-courses scope).
  it("omits course_id when listing all courses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ threads: [] }), { status: 200 }),
    );

    await fetchMessageThreads("token", undefined, "http://localhost:3000");

    const requestedUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requestedUrl).not.toContain("course_id=");
  });

  // Verifies: Thread detail maps snake_case messages to camelCase.
  it("fetches a single thread with messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(detailResponse), { status: 200 }),
    );

    const thread = await fetchMessageThread("token", "5", 7);

    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]?.sentAt).toBe("2026-03-01T00:00:00.000Z");
    expect(
      thread.messages.filter((message) => message.author.role === "student"),
    ).toHaveLength(1);
  });

  // Verifies: Reply posts the trimmed body and returns the updated thread.
  it("posts a reply and returns the updated thread", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(detailResponse), { status: 200 }),
    );

    const updated = await replyToMessageThread("token", "5", "  Thanks!  ", 7);

    const requestInit = fetchSpy.mock.calls[0]?.[1];
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ body: "Thanks!" });
    expect(updated.messages).toHaveLength(2);
  });

  // Verifies: Empty replies fail fast without a network call.
  it("rejects empty replies without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      replyToMessageThread("token", "5", "   "),
    ).rejects.toBeInstanceOf(MessageThreadsApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
