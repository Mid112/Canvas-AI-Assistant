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
  // Verifies: Maps API errors to user-facing content.
  it("maps API errors to user-facing content", () => {
    const response = mapChatReplyToAssistantResponse(
      { error: "LLM unavailable" },
      true,
    );

    expect(response.content).toBe("LLM unavailable");
  });

  it("maps limited-mode Canvas blocks with a connect action", () => {
    const response = mapChatReplyToAssistantResponse(
      {
        error: "This action needs a connected Canvas account.",
        requires_canvas_token: true,
        deferred_request_id: 42,
        limited_mode: true,
      },
      true,
    );

    expect(response.requiresCanvasToken).toBe(true);
    expect(response.deferredRequestId).toBe(42);
    expect(response.interpretedAction?.primaryLink?.label).toMatch(/Connect Canvas/i);
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

  // A course switch the instructor agreed to mid-conversation moves the thread
  // server-side, but the reply that follows is usually a plain read with no
  // preview — and proposed_action.local_course_id, the only course signal the
  // mapper had, exists only on previews. So the answer arrived from the right
  // course while the tab strip stayed on the one they had left: right content,
  // wrong tab name, wrong active course.
  it("reports the course when the server moved the turn to another one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 77,
          is_error: false,
          course_id: 9,
          course_name: "Capstone Project",
          reply: {
            action: "respond",
            message: "3 students submitted to Testing Event 2.",
          },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage("access-token", "yes");

    expect(response.resolvedCourse).toEqual({
      localCourseId: 9,
      courseName: "Capstone Project",
    });
    expect(response.conversationId).toBe(77);
  });

  it("reports no course when the turn stayed where it was", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 9,
          is_error: false,
          course_id: null,
          course_name: null,
          reply: { action: "respond", message: "Here you go." },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage("access-token", "hi");

    expect(response.resolvedCourse).toBeUndefined();
  });

  // A preview names the course the instructor is about to write to. That is a
  // stronger claim than "the conversation is on this course" and has to keep
  // winning, or confirming a write could land in a tab for a different one.
  it("prefers the previewed course over the conversation's", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversation_id: 77,
          is_error: false,
          course_id: 9,
          course_name: "Capstone Project",
          reply: {
            action: "intent_preview",
            proposed_action: { action: "create_assignment", local_course_id: 12 },
            preview_metadata: { course_name: "CPSC 310" },
          },
        }),
        { status: 200 },
      ),
    );

    const response = await sendAssistantMessage("access-token", "make a lab");

    expect(response.resolvedCourse?.localCourseId).toBe(12);
  });

  // Regression test for #1509: the assistant resolved an explicitly named
  // course ("show assignments for COSC 499") against whichever course
  // happened to be active instead. The cause was sendAssistantMessage
  // defaulting local_course_id to the ambient active course on every turn,
  // which beats both an utterance naming a different course and an
  // already-resolved conversation course on the backend (see
  // get_or_create_conversation / handle_chat_message in
  // app/backend/app/services/chat.py) — local_course_id is only ever
  // supposed to carry an explicit "set active course" selection.
  it("never falls back to the active course context for local_course_id", async () => {
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

    await sendAssistantMessage("test-token", "show assignments for COSC 499", {
      context: {
        // Simulates Math 101 being the ambient active course while the
        // user explicitly names a different one in the message itself.
        activeCourseId: 3,
        activeCourseLabel: "Math 101",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "show assignments for COSC 499",
        }),
      }),
    );
  });

  // Verifies: an explicit localCourseId option (a real "set active course"
  // selection) is still forwarded — only the ambient-context fallback was
  // removed.
  it("posts an explicit localCourseId option", async () => {
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
      localCourseId: 3,
      context: { activeCourseId: 9, activeCourseLabel: "Math 101" },
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

  it("defaults restored intent previews with null workflow status to pending", () => {
    const messages = mapConversationToChatMessages({
      id: 9,
      course_id: 3,
      created_at: "2026-07-01T12:00:00Z",
      messages: [
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
          pending_action_status: null,
        },
      ],
    });

    expect(messages[0]).toMatchObject({
      pendingMessageId: 22,
      pendingActionStatus: "pending",
    });
  });

  it("keeps executing workflow previews distinct from confirmed ones", () => {
    const messages = mapConversationToChatMessages({
      id: 9,
      course_id: 3,
      created_at: "2026-07-01T12:00:00Z",
      messages: [
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
          pending_action_status: "executing",
        },
      ],
    });

    expect(messages[0].pendingActionStatus).toBe("executing");
  });

  it("preserves real user messages that start with a bracket", () => {
    const messages = mapConversationToChatMessages({
      id: 9,
      course_id: null,
      created_at: "2026-07-01T12:00:00Z",
      messages: [
        {
          id: 21,
          role: "user",
          content: "[URGENT] Please help with grading",
          created_at: "2026-07-01T12:00:00Z",
        },
        {
          id: 22,
          role: "user",
          content: "[confirmed action]",
          created_at: "2026-07-01T12:01:00Z",
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "[URGENT] Please help with grading",
    });
  });

  it("does not invent pending controls for create_quiz form handoffs", () => {
    const messages = mapConversationToChatMessages({
      id: 9,
      course_id: 3,
      created_at: "2026-07-01T12:00:00Z",
      messages: [
        {
          id: 22,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "Create Recursion Quiz.",
            proposed_action: {
              action: "create_quiz",
              local_course_id: 3,
              title: "Recursion Quiz",
              questions: [],
            },
            preview_metadata: { course: "CPSC 310" },
          }),
          created_at: "2026-07-01T12:01:00Z",
          pending_action_status: null,
        },
      ],
    });

    expect(messages[0].pendingMessageId).toBeUndefined();
    expect(messages[0].pendingActionStatus).toBeUndefined();
    expect(messages[0].interpretedAction?.primaryLink?.href).toBe(
      "/instructor/quizzes/create",
    );
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
