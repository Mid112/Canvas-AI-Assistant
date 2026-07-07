import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  sendAssistantMessage,
} from "@/services/assistant";
import { renderWithInstitution } from "../../utils/renderWithInstitution";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/services/assistant", async () => {
  const actual = await vi.importActual<typeof import("@/services/assistant")>(
    "@/services/assistant",
  );

  return {
    ...actual,
    sendAssistantMessage: vi.fn(actual.sendAssistantMessage),
    confirmAssistantAction: vi.fn(actual.confirmAssistantAction),
    cancelAssistantAction: vi.fn(actual.cancelAssistantAction),
  };
});

const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);
const mockedConfirmAssistantAction = vi.mocked(confirmAssistantAction);
const mockedCancelAssistantAction = vi.mocked(cancelAssistantAction);

describe("ChatWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: "access-token",
      user: { name: "Dr. Jane Doe", role: "instructor" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockedSendAssistantMessage.mockResolvedValue({
      content:
        "I found students who have not submitted the assignment yet. I can help you send a reminder if you'd like.",
      explanation:
        "I analyzed submission data and identified students who have not submitted Assignment 3.",
      interpretedAction: {
        action: "Send Reminder",
        course: "COSC 499",
        affectedStudents: "12 students",
      },
      conversationId: 1,
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
      "access-token",
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
      content: "Cancelled. No changes were made.",
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
      expect(screen.getByText("Cancelled. No changes were made.")).toBeInTheDocument();
    });

    expect(mockedCancelAssistantAction).toHaveBeenCalledWith(
      "access-token",
      7,
      42,
    );
    expect(screen.getByText("This action was cancelled.")).toBeInTheDocument();
  });
});
