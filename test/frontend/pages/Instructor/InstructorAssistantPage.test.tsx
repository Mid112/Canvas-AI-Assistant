import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { sendAssistantMessage } from "@/services/assistant";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockUseAuth = vi.fn();
const mockListAssistantConversations = vi.hoisted(() => vi.fn());
const mockFetchConversation = vi.hoisted(() => vi.fn());
const mockFetchProviders = vi.hoisted(() => vi.fn());
const mockListDeferred = vi.hoisted(() => vi.fn());
const mockResumeDeferred = vi.hoisted(() => vi.fn());
const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);

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
    resumeDeferredAssistantRequest: mockResumeDeferred,
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
          canvas_url: "https://canvas.example.edu",
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
  mockResumeDeferred.mockReset();
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
  // Verifies: Renders the assistant page body; the global layout owns the title.
  it("renders starter prompts and chat", () => {
    renderWithInstitution(<InstructorAssistantPage />);

    expect(
      screen.getByRole("region", { name: "Starter prompts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create an assignment")).toBeInTheDocument();
    expect(screen.getByText("Create a quiz")).toBeInTheDocument();
    expect(screen.getByText("Analyze course performance")).toBeInTheDocument();
    expect(screen.getByText("Draft a student message")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  // Verifies (#1441): Starter prompts hide after the user starts chatting.
  it("hides starter prompts after the first message and restores them on New Chat", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValue({
      content: "Here is a draft.",
      conversationId: 42,
      explanation: "Started from a typed prompt.",
    });

    renderWithInstitution(<InstructorAssistantPage />);

    expect(screen.getByText("Create an assignment")).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Chat message" }),
      "What can you help me with?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Here is a draft."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create an assignment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Starter prompts" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Chat" }));

    expect(
      await screen.findByRole("region", { name: "Starter prompts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a quiz")).toBeInTheDocument();
  });

  // Verifies (#1441): Choosing a starter prompt also clears the guidance.
  it("hides starter prompts after selecting a starter action", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValue({
      content: "Assignment draft ready.",
      conversationId: 7,
      explanation: "Started from a starter prompt.",
    });

    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(
      screen.getByRole("button", { name: /Create an assignment/i }),
    );

    expect(
      await screen.findByText("Assignment draft ready."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Starter prompts" }),
    ).not.toBeInTheDocument();
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

    it("resumes only the next deferred request and keeps the rest queued until send succeeds", async () => {
    const user = userEvent.setup();

    mockListDeferred.mockResolvedValue({
      items: [
        {
          id: 3,
          conversation_id: null,
          message: "Third deferred",
          proposed_action: null,
          status: "deferred",
          created_at: "2026-07-21T12:03:00.000Z",
          resumed_at: null,
        },
        {
          id: 2,
          conversation_id: null,
          message: "Second deferred",
          proposed_action: null,
          status: "deferred",
          created_at: "2026-07-21T12:02:00.000Z",
          resumed_at: null,
        },
        {
          id: 1,
          conversation_id: 9,
          message: "First deferred",
          proposed_action: null,
          status: "deferred",
          created_at: "2026-07-21T12:01:00.000Z",
          resumed_at: null,
        },
      ],
    });
    mockResumeDeferred.mockResolvedValue({
      id: 3,
      conversation_id: null,
      message: "Third deferred",
      proposed_action: null,
      status: "deferred",
      created_at: "2026-07-21T12:03:00.000Z",
      resumed_at: null,
    });

    renderWithInstitution(<InstructorAssistantPage />);

    expect(
      await screen.findByRole("button", { name: "Resume next request" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume next request" }));

    await waitFor(() => {
      expect(mockResumeDeferred).toHaveBeenCalledTimes(1);
    });
    expect(mockResumeDeferred).toHaveBeenCalledWith("token", 3);
    // Resume peeks without consuming — queue stays until chat send succeeds.
    expect(
      await screen.findByRole("button", { name: "Resume next request" }),
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
