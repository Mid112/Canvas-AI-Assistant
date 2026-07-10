import { afterEach, describe, expect, it, vi } from "vitest";

import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  confirmAssistantAction,
  fetchConversation,
  listAssistantConversations,
  mapConversationToChatMessages,
  sendAssistantMessage,
} from "@/services/assistant";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("mapChatReplyToAssistantResponse", () => {
  // Verifies: Maps intent previews to assistant content and interpreted actions.
  it("maps intent previews to assistant content and interpreted actions", () => {
    const response = mapChatReplyToAssistantResponse(
      {
        intent_preview: true,
        summary: "Send reminders to 12 students",
        proposed_action: {
          action: "send_message",
          local_course_id: 3,
        },
        preview_metadata: {
          course_name: "COSC 499",
        },
      },
      false,
    );

    expect(response.content).toContain("Send reminders");
    expect(response.interpretedAction?.course).toBe("COSC 499");
  });

  // Verifies: Maps API errors to user-facing content.
  it("maps API errors to user-facing content", () => {
    const response = mapChatReplyToAssistantResponse(
      { error: "LLM unavailable" },
      true,
    );

    expect(response.content).toBe("LLM unavailable");
  });

  // Verifies: Maps successful confirm replies.
  it("maps successful confirm replies", () => {
    const response = mapChatReplyToAssistantResponse(
      {
        success: true,
        action: "create_assignment",
        data: { id: 12, name: "Midterm Exam" },
      },
      false,
    );

    expect(response.content).toContain("Successfully completed Create Assignment");
    expect(response.content).toContain("Midterm Exam");
  });
});

describe("sendAssistantMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies: Calls the chat API and maps the response.
  it("calls the chat API and maps the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 9,
          is_error: false,
          reply: {
            action: "respond",
            message: "Here are the missing submissions.",
          },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage(
      "access-token",
      "missing submissions",
    );

    expect(response.content).toBe("Here are the missing submissions.");
    expect(response.conversationId).toBe(9);
  });

  // Verifies: Posts course context when provided.
  it("posts course context when provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 7,
          is_error: false,
          reply: { action: "respond", message: "Hello from the backend." },
        }),
        { status: 200 },
      ),
    );

    await sendAssistantMessage("test-token", "hello", {
      context: {
        activeCourseId: 3,
        activeCourseLabel: "CPSC 310",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "hello",
          local_course_id: 3,
        }),
      }),
    );
  });

  // Verifies: Includes conversation_id on follow-up turns.
  it("includes conversation_id on follow-up turns", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 7,
          is_error: false,
          reply: { action: "respond", message: "Follow-up reply." },
        }),
        { status: 200 },
      ),
    );

    await sendAssistantMessage("test-token", "follow up", {
      conversationId: 7,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/",
      expect.objectContaining({
        body: JSON.stringify({
          message: "follow up",
          conversation_id: 7,
        }),
      }),
    );
  });

  // Verifies: Throws AssistantApiError when the API request fails.
  it("throws AssistantApiError when the API request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Service unavailable" }), {
        status: 503,
      }),
    );

    await expect(
      sendAssistantMessage("access-token", "fail please"),
    ).rejects.toBeInstanceOf(AssistantApiError);
  });
});

describe("conversation history helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists assistant conversations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 4,
              course_id: null,
              created_at: "2026-07-01T12:00:00Z",
              updated_at: "2026-07-01T12:05:00Z",
              message_count: 2,
              preview: "Hello from history.",
              pending_action_count: 0,
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    );

    const response = await listAssistantConversations("access-token", {
      limit: 12,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/conversations?limit=12",
      expect.any(Object),
    );
    expect(response.items[0].id).toBe(4);
  });

  it("fetches and maps a stored conversation transcript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 9,
          course_id: 3,
          created_at: "2026-07-01T12:00:00Z",
          messages: [
            {
              id: 21,
              role: "user",
              content: "Create an assignment",
              created_at: "2026-07-01T12:00:00Z",
            },
            {
              id: 22,
              role: "assistant",
              content: JSON.stringify({
                intent_preview: true,
                summary: "Create Assignment 1",
                proposed_action: {
                  action: "create_assignment",
                  local_course_id: 3,
                },
              }),
              created_at: "2026-07-01T12:01:00Z",
              pending_action_status: "pending",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const conversation = await fetchConversation("access-token", 9);
    const messages = mapConversationToChatMessages(conversation);

    expect(messages[0]).toMatchObject({
      role: "user",
      content: "Create an assignment",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "Create Assignment 1",
      conversationId: 9,
      pendingMessageId: 22,
      pendingActionStatus: "pending",
    });
  });
});

describe("confirmAssistantAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies: Posts to /chat/confirm with conversation and pending message ids.
  it("posts to /chat/confirm with conversation and pending message ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 7,
          is_error: false,
          reply: {
            success: true,
            action: "create_assignment",
            data: { id: 12, name: "Midterm Exam" },
          },
        }),
        { status: 200 },
      ),
    );

    const response = await confirmAssistantAction("test-token", 7, 42);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_id: 7,
          pending_message_id: 42,
        }),
      }),
    );
    expect(response.content).toContain("Successfully completed Create Assignment");
    expect(response.conversationId).toBe(7);
  });
});
