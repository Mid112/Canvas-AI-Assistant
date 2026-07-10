import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockUseAuth = vi.fn();
const mockListAssistantConversations = vi.hoisted(() => vi.fn());
const mockFetchConversation = vi.hoisted(() => vi.fn());

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
    fetchConversation: mockFetchConversation,
    listAssistantConversations: mockListAssistantConversations,
    sendAssistantMessage: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: {
      id: 1,
      email: "jane.doe@example.com",
      name: "Dr. Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 1,
          canvas_url: "https://canvas.ubc.ca",
          created_at: "2026-06-26T00:00:00.000Z",
        },
      ],
    },
    accessToken: "token",
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
  mockListAssistantConversations.mockResolvedValue({
    items: [],
    total: 0,
  });
});

describe("InstructorAssistantPage", () => {
  // Verifies: Renders the assistant header, suggested actions, and chat.
  it("renders the assistant header, suggested actions, and chat", () => {
    renderWithInstitution(<InstructorAssistantPage />);

    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Canvas Workflow Management Assistant"),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  it("starts a fresh chat from a loaded conversation", async () => {
    const user = userEvent.setup();

    mockListAssistantConversations.mockResolvedValue({
      items: [
        {
          id: 7,
          course_id: null,
          created_at: "2026-07-09T19:40:00.000Z",
          updated_at: "2026-07-09T19:45:00.000Z",
          message_count: 2,
          preview: "Previous conversation",
          pending_action_count: 0,
        },
      ],
      total: 1,
    });
    mockFetchConversation.mockResolvedValue({
      id: 7,
      course_id: null,
      created_at: "2026-07-09T19:40:00.000Z",
      messages: [
        {
          id: 11,
          role: "user",
          content: "Previous question",
          created_at: "2026-07-09T19:41:00.000Z",
        },
        {
          id: 12,
          role: "assistant",
          content: JSON.stringify({
            action: "respond",
            message: "Previous answer",
          }),
          created_at: "2026-07-09T19:42:00.000Z",
        },
      ],
    });

    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(await screen.findByRole("button", {
      name: /Previous conversation/,
    }));

    expect(await screen.findByText("Previous question")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New Chat/i }));

    await waitFor(() => {
      expect(screen.queryByText("Previous question")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });
});
