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
