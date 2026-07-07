import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  sendAssistantMessage,
} from "@/services/assistant";
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
    fetchConversation: vi.fn(actual.fetchConversation),
  };
});

const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);
const mockedConfirmAssistantAction = vi.mocked(confirmAssistantAction);
const mockedCancelAssistantAction = vi.mocked(cancelAssistantAction);
const mockedFetchConversation = vi.mocked(fetchConversation);

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
    });
  });

  it("shows the seeded welcome message", () => {
    renderWithInstitution(<ChatWindow />);

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });

  it("shows an error for empty submissions", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<ChatWindow />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Please enter a message before sending."),
    ).toBeInTheDocument();
  });

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

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

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
  });

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
    });

    renderWithInstitution(
      <ChatWindow initialConversationId={7} initialPendingMessageId={42} />,
    );

    expect(await screen.findByText("Create a midterm exam")).toBeInTheDocument();
    expect(
      screen.getByText("I prepared a midterm exam for review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review preview/ })).toHaveAttribute(
      "href",
      "/instructor/actions/preview?conversation=7&pending=42",
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});
