import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { MessageInboxPanel } from "@/components/messages/MessageInboxPanel";
import { StudentRepliesSection } from "@/components/messages/StudentRepliesSection";
import { mockMessageThreads } from "@/data/mockMessageThreads";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("StudentRepliesSection", () => {
  it("lists student replies for a thread", () => {
    render(<StudentRepliesSection thread={mockMessageThreads[0]!} />);

    expect(screen.getByLabelText("Student replies")).toBeInTheDocument();
    expect(screen.getByText("Alex Thompson")).toBeInTheDocument();
    expect(
      screen.getByText("Thanks for the reminder — I submitted last night."),
    ).toBeInTheDocument();
  });

  it("shows empty state when students have not replied", () => {
    render(<StudentRepliesSection thread={mockMessageThreads[2]!} />);

    expect(
      screen.getByText("Students have not replied to this message yet."),
    ).toBeInTheDocument();
  });
});

describe("MessageInboxPanel", () => {
  beforeEach(() => {
    localStorage.clear();
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
  });

  it("shows inbox threads and lets the instructor reply", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MessageInboxPanel courseId={1} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Reminder: Programming Assignment 3 Due Friday"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Student replies")).toBeInTheDocument();

    const replyInput = screen.getByLabelText("Reply to students");
    fireEvent.change(replyInput, {
      target: { value: "Glad you submitted on time." },
    });
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    expect(
      await screen.findAllByText("Glad you submitted on time."),
    ).not.toHaveLength(0);
  });
});
