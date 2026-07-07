import { afterEach, describe, expect, it, vi } from "vitest";

import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  confirmAssistantAction,
  sendAssistantMessage,
} from "@/services/assistant";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("mapChatReplyToAssistantResponse", () => {
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

  it("maps API errors to user-facing content", () => {
    const response = mapChatReplyToAssistantResponse(
      { error: "LLM unavailable" },
      true,
    );

    expect(response.content).toBe("LLM unavailable");
  });
});

describe("sendAssistantMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /chat/ with auth and course context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 7,
          is_error: false,
          reply: {
            action: "respond",
            message: "Hello from the backend.",
          },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage("test-token", "hello", {
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
    expect(response).toEqual({
      content: "Hello from the backend.",
      conversationId: 7,
      pendingMessageId: undefined,
    });
  });

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

  it("returns assistant error content when the backend returns is_error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 1,
          is_error: true,
          reply: {
            error: "The assistant is currently unavailable. Please try again shortly.",
          },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage("test-token", "hello");

    expect(response.content).toBe(
      "The assistant is currently unavailable. Please try again shortly.",
    );
  });

  it("throws AssistantApiError for HTTP failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
      }),
    );

    await expect(
      sendAssistantMessage("bad-token", "hello"),
    ).rejects.toEqual(new AssistantApiError("Not authenticated", 401));
  });
});

describe("confirmAssistantAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /chat/confirm with conversation and pending message ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 7,
          is_error: false,
          reply: {
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
    expect(response.content).toContain("completed successfully");
    expect(response.conversationId).toBe(7);
  });
});
