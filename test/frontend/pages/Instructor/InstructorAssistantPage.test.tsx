import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockUseAuth = vi.fn();
const mockListAssistantConversations = vi.hoisted(() => vi.fn());
const mockFetchConversation = vi.hoisted(() => vi.fn());
const mockFetchProviders = vi.hoisted(() => vi.fn());
const mockListDeferred = vi.hoisted(() => vi.fn());

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
    listDeferredAssistantRequests: mockListDeferred,
    sendAssistantMessage: vi.fn(),
  };
});

vi.mock("@/services/instructorLlmProviders", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/instructorLlmProviders")
  >("@/services/instructorLlmProviders");
  return {
    ...actual,
    fetchInstructorLlmProviders: mockFetchProviders,
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
  mockListDeferred.mockResolvedValue({ items: [] });
  mockFetchProviders.mockResolvedValue({
    default_provider: "ollama",
    default_model: "llama3.2",
    providers: [
      {
        id: "ollama",
        name: "Ollama",
        hosting: "local",
        default_model: "llama3.2",
        configured: true,
        status: "available",
        models: ["llama3.2"],
        detail: null,
        connected: true,
        requires_api_key: false,
        accepts_api_key: false,
        has_api_key: false,
        saved_model: null,
        saved_base_url: null,
      },
    ],
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
    expect(screen.getByText("Suggested actions")).toBeInTheDocument();
    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  it("shows limited mode when Canvas is not connected", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: false,
        canvas_connections: [],
      },
      accessToken: "token",
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithInstitution(<InstructorAssistantPage />);

    expect(await screen.findByText("Limited mode")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Connect Canvas to continue" }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New Chat/i }));

    await waitFor(() => {
      expect(screen.queryByText("Previous question")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
  });
});
