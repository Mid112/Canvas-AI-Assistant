import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { ActiveCourseProvider } from "@/contexts/ActiveCourseProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  sendAssistantMessage,
} from "@/services/assistant";
import { reverseWorkflow } from "@/services/workflowHistory";
import { renderWithInstitution } from "../../utils/renderWithInstitution";

const mockUseAuth = vi.fn();
const mockUseActiveCourse = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

vi.mock("@/services/assistant", async () => {
  const actual = await vi.importActual<typeof import("@/services/assistant")>(
    "@/services/assistant",
  );

  return {
    ...actual,
    sendAssistantMessage: vi.fn(actual.sendAssistantMessage),
    confirmAssistantAction: vi.fn(actual.confirmAssistantAction),
    cancelAssistantAction: vi.fn(actual.cancelAssistantAction),
    pauseAssistantAction: vi.fn(actual.pauseAssistantAction),
    resumeAssistantAction: vi.fn(actual.resumeAssistantAction),
    renameAssistantAction: vi.fn(actual.renameAssistantAction),
    fetchConversation: vi.fn(actual.fetchConversation),
  };
});

vi.mock("@/services/workflowHistory", async () => {
  const actual = await vi.importActual<typeof import("@/services/workflowHistory")>(
    "@/services/workflowHistory",
  );

  return {
    ...actual,
    reverseWorkflow: vi.fn(actual.reverseWorkflow),
  };
});

const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);
const mockedConfirmAssistantAction = vi.mocked(confirmAssistantAction);
const mockedCancelAssistantAction = vi.mocked(cancelAssistantAction);
const mockedFetchConversation = vi.mocked(fetchConversation);
const mockedReverseWorkflow = vi.mocked(reverseWorkflow);

describe("ChatWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: "test-token",
      user: null,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [],
      isLoading: false,
      isSaving: false,
      error: null,
      selectActiveCourse: vi.fn(),
      refreshActiveCourse: vi.fn(),
      notifyCoursesChanged: vi.fn(),
    });
  });

  // Verifies: Shows the seeded welcome message.
  it("shows the seeded welcome message", () => {
    renderWithInstitution(<ChatWindow />);

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });

  // Verifies: Regression (#10) — the message input is protected with
  // shrink-0 so a tall sibling (e.g. a growing saved-drafts panel above
  // the chat window) can never squeeze it down to zero height and make
  // it inaccessible.
  it("protects the message input from being flex-shrunk", () => {
    renderWithInstitution(<ChatWindow />);

    const input = screen.getByRole("textbox", { name: "Chat message" });
    const inputWrapper = input.closest("form")?.parentElement;
    expect(inputWrapper).toHaveClass("shrink-0");
  });

  // Verifies: Shows an error for empty submissions.
  it("shows an error for empty submissions", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<ChatWindow />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Please enter a message before sending."),
    ).toBeInTheDocument();
  });

  // Verifies: Adds a user message and assistant reply.
  it("adds a user message and assistant reply", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "I found missing submissions.",
      conversationId: 1,
      pendingMessageId: 42,
      explanation:
        "I analyzed submission data and identified students who have not submitted Assignment 3.",
      interpretedAction: {
        action: "Send Reminder",
        course: "COSC 499",
        affectedStudents: "12 students",
        primaryLink: {
          label: "Review preview",
          href: "/instructor/actions/preview?conversation=1&pending=42",
        },
      },
    });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Show missing submissions",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Explanation")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("keeps form handoffs in chat until the instructor clicks the action link", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "I prepared the quiz form.",
      conversationId: 1,
      navigateTo: {
        path: "/instructor/quizzes/create",
        state: { aiQuizDraft: { title: "Midterm" } },
      },
      interpretedAction: {
        action: "Create Quiz",
        course: "Capstone Project",
        affectedStudents: "Course-wide",
        primaryLink: {
          label: "Open quiz creation form",
          href: "/instructor/quizzes/create",
        },
      },
    });

    renderWithInstitution(<ChatWindow />);
    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "create a quiz",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I prepared the quiz form.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open quiz creation form/i }),
    ).toBeInTheDocument();
  });

  // Verifies: Keeps chat usable while active course context is loading.
  it("keeps chat usable while active course context is loading", async () => {
    const user = userEvent.setup();
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [],
      isLoading: true,
      isSaving: false,
      error: null,
      selectActiveCourse: vi.fn(),
      refreshActiveCourse: vi.fn(),
    });
    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "I can still help while course context loads.",
      conversationId: 1,
    });

    renderWithInstitution(<ChatWindow />);

    const input = screen.getByRole("textbox", { name: "Chat message" });
    expect(input).toBeEnabled();

    await user.type(input, "Can I still chat?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockedSendAssistantMessage).toHaveBeenCalledWith(
        "test-token",
        "Can I still chat?",
        expect.objectContaining({
          context: {},
        }),
      );
    });
    expect(
      await screen.findByText("I can still help while course context loads."),
    ).toBeInTheDocument();
  });

  // Verifies: Stop aborts the in-flight request and shows a soft Stopped message (not an error banner).
  it("shows a soft Stopped message when the request is aborted", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockImplementation(
      (_token, _text, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error("expected abort signal"));
            return;
          }
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Write a long answer",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const stopButton = await screen.findByRole("button", {
      name: "Stop response",
    });
    await user.click(stopButton);

    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/temporarily unavailable|Something went wrong/i),
    ).not.toBeInTheDocument();
  });

  // Verifies (#1439): Shows stage-aware loading feedback immediately and clears it on success.
  it("shows stage-aware loading feedback immediately and clears it on success", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: {
      content: string;
      conversationId: number;
      explanation: string;
    }) => void;

    mockedSendAssistantMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Show missing submissions",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("status", { name: "Analyzing data…" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Analyzing data…")).toBeInTheDocument();

    resolveRequest({
      content: "Here are the missing submissions.",
      conversationId: 1,
      explanation: "Analyzed submission data.",
    });

    expect(
      await screen.findByText("Here are the missing submissions."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Analyzing data…" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Analyzing data…")).not.toBeInTheDocument();
  });

  // Verifies (#1439): Clears loading feedback on error so Retry is usable.
  it("clears loading feedback when the request fails", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockRejectedValueOnce(
      new AssistantApiError(
        "The assistant is temporarily unavailable. Please try again.",
      ),
    );

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Create an assignment",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText(/assistant is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connecting to Canvas…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  // Verifies (#1439): Clears loading feedback on cancel/stop.
  it("clears loading feedback when the request is stopped", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockImplementation(
      (_token, _text, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error("expected abort signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "What can you help me with?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("status", { name: "Thinking…" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop response" }));

    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Thinking…" })).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });

  // Verifies (#1439): Advances loading copy and shows a long-wait note while pending.
  it("advances loading stage copy and shows a long-wait note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    let resolveRequest!: (value: {
      content: string;
      conversationId: number;
      explanation: string;
    }) => void;

    mockedSendAssistantMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    try {
      renderWithInstitution(<ChatWindow />);

      await user.type(
        screen.getByRole("textbox", { name: "Chat message" }),
        "What can you help me with?",
      );
      await user.click(screen.getByRole("button", { name: "Send message" }));

      expect(
        await screen.findByRole("status", { name: "Thinking…" }),
      ).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(
        screen.getByRole("status", { name: "Generating response…" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Taking longer than usual. You can stop and try again."),
      ).toBeInTheDocument();

      resolveRequest({
        content: "I can help with Canvas tasks.",
        conversationId: 1,
        explanation: "General help.",
      });

      expect(
        await screen.findByText("I can help with Canvas tasks."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Taking longer than usual. You can stop and try again."),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Verifies: Shows an error banner and retry button when the request fails.
  it("shows an error banner and retry button when the request fails", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage
      .mockRejectedValueOnce(
        new AssistantApiError(
          "The assistant is temporarily unavailable. Please try again.",
        ),
      )
      .mockResolvedValueOnce({
        content: "Retry succeeded.",
        conversationId: 1,
        explanation: "The assistant responded after a retry.",
      });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Show missing submissions",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText(/assistant is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Retry succeeded.")).toBeInTheDocument();
    });

    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(mockedSendAssistantMessage).toHaveBeenCalledTimes(2);
  });

  // Verifies: Confirms a pending action from the chat window.
  it("confirms a pending action from the chat window", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "I can create the midterm exam after you confirm.",
      conversationId: 7,
      pendingMessageId: 42,
      interpretedAction: {
        action: "Create Assignment",
        course: "CPSC 310",
        affectedStudents: "Entire class",
      },
    });
    mockedConfirmAssistantAction.mockResolvedValueOnce({
      content: "Successfully completed Create Assignment: Midterm Exam.",
      conversationId: 7,
    });
    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 310,
      created_at: "2026-07-10T12:00:00.000Z",
      messages: [],
      // Verifies: After approval, chat refreshes workflow status metadata so
      // the confirmed card can expose the direct reversal action.
      workflow_statuses: {
        42: {
          workflow_id: 123,
          status: "executed",
          action_name: "create_assignment",
          result_message_id: null,
        },
      },
    });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Create a midterm exam",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText("Successfully completed Create Assignment: Midterm Exam."),
      ).toBeInTheDocument();
    });

    expect(mockedConfirmAssistantAction).toHaveBeenCalledWith(
      "test-token",
      7,
      42,
    );
    expect(screen.getByText("This action was confirmed.")).toBeInTheDocument();
    expect(screen.queryByText("Interpreted Action")).not.toBeInTheDocument();
  });

  // Verifies: Cancels a pending action from the chat window.
  it("cancels a pending action from the chat window", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "I can create the midterm exam after you confirm.",
      conversationId: 7,
      pendingMessageId: 42,
      interpretedAction: {
        action: "Create Assignment",
        course: "CPSC 310",
        affectedStudents: "Entire class",
      },
    });
    mockedCancelAssistantAction.mockResolvedValueOnce({
      content: "Cancelled — no changes were made.",
      conversationId: 7,
    });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Create a midterm exam",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(
        screen.getByText("Cancelled — no changes were made."),
      ).toBeInTheDocument();
    });

    expect(mockedCancelAssistantAction).toHaveBeenCalledWith(
      "test-token",
      7,
      42,
    );
    expect(screen.getByText("This action was cancelled.")).toBeInTheDocument();
  });

  // Verifies: Supersedes the previous pending card when the user sends a modification.
  it("supersedes the previous pending card when the user sends a modification", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage
      .mockResolvedValueOnce({
        content: "I can create the midterm exam after you confirm.",
        conversationId: 7,
        pendingMessageId: 42,
        interpretedAction: {
          action: "Create Assignment",
          course: "CPSC 310",
          affectedStudents: "Entire class",
        },
      })
      .mockResolvedValueOnce({
        content: "Updated preview for the midterm exam.",
        conversationId: 7,
        pendingMessageId: 43,
        interpretedAction: {
          action: "Create Assignment",
          course: "CPSC 310",
          affectedStudents: "Entire class",
        },
      });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Create a midterm exam",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByRole("button", { name: "Confirm" });

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Make it open book",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(
        screen.getByText("This proposal was replaced by a newer request."),
      ).toBeInTheDocument();
    });

    expect(mockedSendAssistantMessage).toHaveBeenLastCalledWith(
      "test-token",
      "Make it open book",
      expect.objectContaining({
        pendingMessageId: 42,
      }),
    );
    expect(screen.getByText("Updated preview for the midterm exam.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(1);
  });

  it("sends an initialPrompt exactly once under React StrictMode's dev-only double effect invocation", async () => {
    /* Regression test for a real incident: clicking a dashboard Quick Action
     * (which navigates to the assistant with an initialPrompt) sent the same
     * message twice. StrictMode intentionally double-invokes effects on
     * mount in development; the effect handling initialPrompt reset its own
     * "already sent" guard back to null immediately after sending, so the
     * second invocation — which still saw the same initialPrompt, since the
     * parent's state clearing it is asynchronous — sent it again. */
    mockedSendAssistantMessage.mockResolvedValue({
      content: "What subject and body content would you like to use?",
      conversationId: 1,
    });

    render(
      <StrictMode>
        <AuthProvider>
          <InstitutionProvider>
            <ActiveCourseProvider>
              <MemoryRouter>
                <ChatWindow initialPrompt="Help me draft a course announcement for my active course." />
              </MemoryRouter>
            </ActiveCourseProvider>
          </InstitutionProvider>
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Help me draft a course announcement for my active course.",
        ),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText("What subject and body content would you like to use?"),
      ).toBeInTheDocument();
    });

    expect(mockedSendAssistantMessage).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByText(
        "Help me draft a course announcement for my active course.",
      ),
    ).toHaveLength(1);
  });

  it("does not target either preview when a restored conversation has multiple pending previews", async () => {
    // With more than one preview simultaneously pending (e.g. a grouped
    // send_message batch), which one a free-typed follow-up refers to is
    // ambiguous — see deliverAssistantResponse's identical single-pending
    // gate. A follow-up starts a fresh normal turn instead of guessing.
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValueOnce({
      content: "Here's what I found.",
      conversationId: 7,
    });

    renderWithInstitution(
      <ChatWindow
        loadedConversation={{
          id: 7,
          course_id: 3,
          created_at: "2026-06-24T10:00:00.000Z",
          messages: [
            {
              id: 42,
              role: "assistant",
              content: JSON.stringify({
                intent_preview: true,
                summary: "First pending proposal",
                proposed_action: { action: "fetch_courses" },
              }),
              created_at: "2026-06-24T10:01:00.000Z",
              pending_action_status: "pending",
            },
            {
              id: 43,
              role: "assistant",
              content: JSON.stringify({
                intent_preview: true,
                summary: "Newest pending proposal",
                proposed_action: { action: "fetch_assignments" },
              }),
              created_at: "2026-06-24T10:02:00.000Z",
              pending_action_status: "pending",
            },
          ],
        }}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Change the latest one",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockedSendAssistantMessage).toHaveBeenCalledWith(
        "test-token",
        "Change the latest one",
        expect.objectContaining({
          conversationId: 7,
          pendingMessageId: undefined,
        }),
      );
    });
  });

  it("restores conversation history when returning from a workflow preview", async () => {
    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 11,
          role: "user",
          content: "Create a midterm exam",
          created_at: "2026-06-24T10:01:00.000Z",
        },
        {
          id: 42,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "I prepared a midterm exam for review.",
            proposed_action: {
              action: "create_assignment",
            },
            preview_metadata: {
              course_name: "CPSC 310",
              audience: { label: "Entire class" },
            },
          }),
          created_at: "2026-06-24T10:02:00.000Z",
        },
      ],
      workflow_statuses: {
        42: {
          workflow_id: 1,
          status: "pending",
          action_name: "create_assignment",
          result_message_id: null,
        },
      },
    });

    renderWithInstitution(
      <ChatWindow initialConversationId={7} initialPendingMessageId={42} />,
    );

    expect(
      await screen.findByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Create a midterm exam")).toBeInTheDocument();
    expect(
      screen.getByText("I prepared a midterm exam for review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review preview/ })).toHaveAttribute(
      "href",
      "/instructor/actions/preview?conversation=7&pending=42",
    );
  });

  // Verifies: the E2E-reported bug — a preview that was already confirmed
  // in an earlier session shows as confirmed (no Confirm/Cancel buttons)
  // on reload, using the authoritative workflow_statuses map rather than
  // defaulting every intent_preview message to "pending".
  it("shows an already-confirmed preview as confirmed on reload, not pending", async () => {
    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 42,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "I prepared a midterm exam for review.",
            proposed_action: { action: "create_assignment" },
            preview_metadata: {
              course_name: "CPSC 310",
              audience: { label: "Entire class" },
              risk_metadata: {
                risk_level: "medium",
                classification: "modifying",
                requires_confirmation: true,
                confirmation_requirement: {
                  type: "standard",
                  label: "Standard confirmation",
                  description: "Review before executing this action.",
                },
                destructive: false,
                reversible: true,
                undoable: true,
                can_undo: true,
                reversibility: "This action can be undone from workflow history.",
                warnings: [],
                technical_details: { action: "create_assignment" },
              },
            },
          }),
          created_at: "2026-06-24T10:02:00.000Z",
        },
      ],
      workflow_statuses: {
        42: {
          workflow_id: 1,
          status: "executed",
          action_name: "create_assignment",
          result_message_id: 43,
        },
      },
    });

    renderWithInstitution(<ChatWindow initialConversationId={7} />);

    expect(
      await screen.findByText("This action was confirmed."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  // Verifies: a workflow still mid-execution shows the "currently running"
  // state on reload, not the pending Confirm/Cancel controls — regression
  // for mapWorkflowStatus (types/chat.ts) previously falling "executing"
  // through to "pending" on this restore path.
  it("shows a still-executing preview as running on reload, not pending", async () => {
    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 42,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "I prepared a midterm exam for review.",
            proposed_action: { action: "create_assignment" },
            preview_metadata: {
              course_name: "CPSC 310",
              audience: { label: "Entire class" },
            },
          }),
          created_at: "2026-06-24T10:02:00.000Z",
        },
      ],
      workflow_statuses: {
        42: {
          workflow_id: 1,
          status: "executing",
          action_name: "create_assignment",
          result_message_id: null,
        },
      },
    });

    renderWithInstitution(<ChatWindow initialConversationId={7} />);

    expect(
      await screen.findByText("This action is currently running."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  // Verifies: Direct reversal from a confirmed chat card calls the backend
  // reversal endpoint and appends the persisted reversal transcript message.
  it("shows a persisted reversal message after direct reversal", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(true);

    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 42,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "I prepared a midterm exam for review.",
            proposed_action: { action: "create_assignment" },
            preview_metadata: {
              course_name: "CPSC 310",
              audience: { label: "Entire class" },
              risk_metadata: {
                risk_level: "medium",
                classification: "modifying",
                requires_confirmation: true,
                confirmation_requirement: {
                  type: "standard",
                  label: "Standard confirmation",
                  description: "Review before executing this action.",
                },
                destructive: false,
                reversible: true,
                undoable: true,
                can_undo: true,
                reversibility: "This action can be undone from workflow history.",
                warnings: [],
                technical_details: { action: "create_assignment" },
              },
            },
          }),
          created_at: "2026-06-24T10:02:00.000Z",
        },
      ],
      workflow_statuses: {
        42: {
          workflow_id: 123,
          status: "executed",
          action_name: "create_assignment",
          result_message_id: 43,
        },
      },
    });
    mockedReverseWorkflow.mockResolvedValueOnce({
      id: "123",
      timestamp: "2026-06-24T10:02:00.000Z",
      actionName: "create_assignment",
      workflowName: "Create Assignment",
      prompt: "Create a midterm exam",
      userName: "Instructor",
      status: "approved",
      affectedResources: [],
      affectedResourcesSummary: "assignment: Midterm Exam",
      undoable: true,
      undoneAt: "2026-06-24T10:04:00.000Z",
    });
    mockedFetchConversation.mockResolvedValueOnce({
      id: 7,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 42,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "I prepared a midterm exam for review.",
            proposed_action: { action: "create_assignment" },
            preview_metadata: { course_name: "CPSC 310", audience: { label: "Entire class" } },
          }),
          created_at: "2026-06-24T10:02:00.000Z",
        },
        {
          id: 44,
          role: "assistant",
          content: "Reversed Create Assignment: the created assignment was deleted from Canvas.",
          created_at: "2026-06-24T10:04:00.000Z",
        },
      ],
      workflow_statuses: {
        42: {
          workflow_id: 123,
          status: "executed",
          action_name: "create_assignment",
          result_message_id: 43,
        },
      },
    });

    try {
      renderWithInstitution(<ChatWindow initialConversationId={7} />);

      await user.click(await screen.findByRole("button", { name: "Reverse action" }));

      await waitFor(() => {
        expect(mockedReverseWorkflow).toHaveBeenCalledWith("test-token", "123");
      });
      expect(
        await screen.findByText(
          "Reversed Create Assignment: the created assignment was deleted from Canvas.",
        ),
      ).toBeInTheDocument();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  // Verifies: two previews resolved OUT OF ORDER (the second one confirmed
  // before the first is cancelled) each still show their own correct
  // Verifies: two create_assignment previews keep their own status on
  // reload — the old FIFO-from-transcript-order reconstruction would have
  // mislabeled these by resolving markers against the oldest still-open
  // preview regardless of which one they actually settled.
  // (send_message is form-handoff and never gets chat confirm controls.)
  it("keeps each preview's correct status on reload when resolved out of order", async () => {
    mockedFetchConversation.mockResolvedValueOnce({
      id: 9,
      course_id: 3,
      created_at: "2026-06-24T10:00:00.000Z",
      messages: [
        {
          id: 50,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "Create Quiz for Alice's section.",
            proposed_action: {
              action: "create_assignment",
              title: "Quiz A",
              description: "A short quiz on course topics.",
              due_date: "2030-01-01T00:00:00",
              points_possible: 10,
            },
            preview_metadata: { course_name: "CPSC 310", audience: { label: "Entire class" } },
          }),
          created_at: "2026-06-24T10:01:00.000Z",
        },
        {
          id: 51,
          role: "assistant",
          content: JSON.stringify({
            intent_preview: true,
            summary: "Create Homework for Bob's section.",
            proposed_action: {
              action: "create_assignment",
              title: "Homework B",
              description: "A short homework on course topics.",
              due_date: "2030-02-01T00:00:00",
              points_possible: 20,
            },
            preview_metadata: { course_name: "CPSC 310", audience: { label: "Entire class" } },
          }),
          created_at: "2026-06-24T10:01:05.000Z",
        },
      ],
      // Later preview was confirmed; earlier preview was cancelled —
      // the reverse of creation order.
      workflow_statuses: {
        50: {
          workflow_id: 5,
          status: "cancelled",
          action_name: "create_assignment",
          result_message_id: null,
        },
        51: {
          workflow_id: 6,
          status: "executed",
          action_name: "create_assignment",
          result_message_id: 52,
        },
      },
    });

    renderWithInstitution(<ChatWindow initialConversationId={9} />);

    expect(
      await screen.findByText("Create Quiz for Alice's section."),
    ).toBeInTheDocument();
    expect(screen.getByText("Create Homework for Bob's section.")).toBeInTheDocument();

    expect(screen.getByText("This action was cancelled.")).toBeInTheDocument();
    expect(screen.getByText("This action was confirmed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("marks confirm as failed when the backend returns is_error", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValue({
      content: "Ready to create Homework.",
      conversationId: 21,
      pendingMessageId: 88,
      explanation: "Review before confirming.",
      interpretedAction: {
        action: "Create Assignment",
        course: "CPSC 310",
        affectedStudents: "Entire class",
        details: [],
        risk: {
          risk_level: "medium",
          classification: "modifying",
          requires_confirmation: true,
          confirmation_requirement: {
            type: "simple",
            label: "Confirm",
            description: "Confirm to create.",
          },
          destructive: false,
          reversible: true,
          undoable: true,
          can_undo: true,
          reversibility: "Can be undone.",
          warnings: [],
          technical_details: {},
        },
      },
    });
    mockedConfirmAssistantAction.mockResolvedValue({
      content: "Canvas rejected this write.",
      conversationId: 21,
      isError: true,
    });

    renderWithInstitution(<ChatWindow />);
    await user.type(
      screen.getByPlaceholderText(/ask me anything about your canvas courses/i),
      "Create homework",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Ready to create Homework.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText("This action failed to complete — nothing was changed."),
    ).toBeInTheDocument();
    expect(screen.getByText("Canvas rejected this write.")).toBeInTheDocument();
  });
});
