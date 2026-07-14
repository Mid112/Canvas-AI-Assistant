import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { MessageInboxPanel } from "@/components/messages/MessageInboxPanel";
import { mockMessageThreads } from "@/data/mockMessageThreads";
import * as messageThreads from "@/services/messageThreads";
import type { MessageThread } from "@/types/messageThread";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => "http://localhost:3000",
}));

vi.mock("@/services/messageThreads", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/messageThreads")>();
  return {
    ...actual,
    fetchMessageThreads: vi.fn(),
    fetchMessageThread: vi.fn(),
    replyToMessageThread: vi.fn(),
  };
});

const baseThread = mockMessageThreads[0]!;
const summaryThread: MessageThread = { ...baseThread, messages: [] };

describe("MessageInboxPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        email: "jane@example.com",
        name: "Jane",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
        canvas_connections: [],
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.mocked(messageThreads.fetchMessageThreads).mockResolvedValue({
      threads: [summaryThread],
    });
    vi.mocked(messageThreads.fetchMessageThread).mockResolvedValue(baseThread);
    vi.mocked(messageThreads.replyToMessageThread).mockImplementation(
      async (_token, _threadId, body) => ({
        ...baseThread,
        preview: body,
        messages: [
          ...baseThread.messages,
          {
            id: "reply-new",
            author: { id: "500", name: "You", role: "instructor" },
            body,
            sentAt: new Date().toISOString(),
          },
        ],
      }),
    );
  });

  it("loads real inbox threads and lets the instructor reply", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MessageInboxPanel courseId={1} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Reminder: Programming Assignment 3 Due Friday"),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Conversation")).toBeInTheDocument();

    const replyInput = screen.getByLabelText("Reply to students");
    await user.type(replyInput, "Glad you submitted on time.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    expect(
      await screen.findAllByText("Glad you submitted on time."),
    ).not.toHaveLength(0);
    expect(messageThreads.replyToMessageThread).toHaveBeenCalledWith(
      "token",
      summaryThread.id,
      "Glad you submitted on time.",
      1,
      "http://localhost:3000",
    );
  });

  it("switches scope to all courses and reloads", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MessageInboxPanel courseId={1} />
      </MemoryRouter>,
    );

    await screen.findByText("Reminder: Programming Assignment 3 Due Friday");

    await user.click(screen.getByRole("button", { name: "All courses" }));

    expect(messageThreads.fetchMessageThreads).toHaveBeenLastCalledWith(
      "token",
      undefined,
      "http://localhost:3000",
    );
  });
});
