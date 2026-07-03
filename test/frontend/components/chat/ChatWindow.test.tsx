import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";
import {
  AssistantApiError,
  sendAssistantMessage,
} from "@/services/assistant";
import { renderWithInstitution } from "../../utils/renderWithInstitution";

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the seeded welcome message", () => {
    renderWithInstitution(<ChatWindow />);

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });

  it("shows an error for empty submissions", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithInstitution(<ChatWindow />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Please enter a message before sending."),
    ).toBeInTheDocument();
  });

  it("adds a user message and assistant reply after a delay", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Show missing submissions",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is typing")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      expect(screen.getByText("Explanation")).toBeInTheDocument();
    });

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
  });

  it("shows an error banner and retry button when the mock request fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockedSendAssistantMessage
      .mockRejectedValueOnce(
        new AssistantApiError(
          "The assistant is temporarily unavailable. Please try again.",
        ),
      )
      .mockResolvedValueOnce({
        content: "Retry succeeded.",
        explanation: "The assistant responded after a retry.",
      });

    renderWithInstitution(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "Show missing submissions",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await vi.advanceTimersByTimeAsync(2000);

    expect(
      await screen.findByText(/assistant is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      expect(screen.getByText("Retry succeeded.")).toBeInTheDocument();
    });

    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(mockedSendAssistantMessage).toHaveBeenCalledTimes(2);
  });
});
