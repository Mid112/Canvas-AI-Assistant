import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssistantApiError,
  confirmAssistantAction,
  sendAssistantMessage,
} from "@/services/assistant";

describe("sendAssistantMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /chat/ with auth and course context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: 7,
        is_error: false,
        reply: {
          action: "respond",
          message: "Hello from the backend.",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const response = await sendAssistantMessage("hello", {
      accessToken: "test-token",
      context: {
        activeCourseId: 3,
        activeCourseLabel: "CPSC 310",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          message: "hello",
          local_course_id: 3,
        }),
      }),
    );
    expect(response).toEqual({
      content: "Hello from the backend.",
      conversationId: 7,
    });
  });

  it("includes conversation_id on follow-up turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: 7,
        is_error: false,
        reply: { action: "respond", message: "Follow-up reply." },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await sendAssistantMessage("follow up", {
      accessToken: "test-token",
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

  it("throws AssistantApiError when the backend returns is_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          conversation_id: 1,
          is_error: true,
          reply: {
            error: "The assistant is currently unavailable. Please try again shortly.",
          },
        }),
      }),
    );

    await expect(
      sendAssistantMessage("hello", { accessToken: "test-token" }),
    ).rejects.toEqual(
      new AssistantApiError(
        "The assistant is currently unavailable. Please try again shortly.",
      ),
    );
  });

  it("throws AssistantApiError for HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Not authenticated" }),
      }),
    );

    await expect(
      sendAssistantMessage("hello", { accessToken: "bad-token" }),
    ).rejects.toEqual(new AssistantApiError("Not authenticated", 401));
  });
});

describe("confirmAssistantAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /chat/confirm with conversation and pending message ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: 7,
        is_error: false,
        reply: {
          success: true,
          action: "create_assignment",
          data: { id: 12, name: "Midterm Exam" },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

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
