import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";
import {
  AssistantApiError,
  sendAssistantMessage,
} from "@/services/assistant";

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
  };
});

const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);

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
    render(<ChatWindow />);

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });

  it("shows an error for empty submissions", async () => {
    const user = userEvent.setup();

    render(<ChatWindow />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Please enter a message before sending."),
    ).toBeInTheDocument();
  });

  it("adds a user message and assistant reply after a delay", async () => {
    const user = userEvent.setup();

    render(<ChatWindow />);

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
  });

  it("shows an error banner and retry button when the mock request fails", async () => {
    const user = userEvent.setup();

    mockedSendAssistantMessage
      .mockRejectedValueOnce(
        new AssistantApiError(
          "The assistant is temporarily unavailable. Please try again.",
        ),
      )
      .mockResolvedValueOnce({
        content: "Retry succeeded.",
        explanation: "The assistant responded after a retry.",
        conversationId: 1,
      });

    render(<ChatWindow />);

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
});
