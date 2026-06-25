import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWindow } from "@/components/chat/ChatWindow";

describe("ChatWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the seeded welcome message", () => {
    render(<ChatWindow />);

    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });

  it("shows an error for empty submissions", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ChatWindow />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Please enter a message before sending."),
    ).toBeInTheDocument();
  });

  it("adds a user message and assistant reply after a delay", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ChatWindow />);

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

    render(<ChatWindow />);

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "fail please",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await vi.advanceTimersByTimeAsync(2000);

    expect(
      await screen.findByText(/assistant is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
