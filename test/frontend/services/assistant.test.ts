import { describe, expect, it, vi } from "vitest";

import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
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

    const response = await sendAssistantMessage("access-token", "missing submissions");

    expect(response.content).toBe("Here are the missing submissions.");
    expect(response.conversationId).toBe(9);
  });

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
