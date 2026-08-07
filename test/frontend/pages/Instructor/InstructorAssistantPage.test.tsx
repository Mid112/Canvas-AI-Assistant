import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveQuickAction } from "@/lib/quick-actions";
import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { paths } from "@/routes/paths";
import { sendAssistantMessage } from "@/services/assistant";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockUseAuth = vi.fn();
const mockNavigate = vi.hoisted(() => vi.fn());
const mockListAssistantConversations = vi.hoisted(() => vi.fn());
const mockFetchConversation = vi.hoisted(() => vi.fn());
const mockFetchProviders = vi.hoisted(() => vi.fn());
const mockListDeferred = vi.hoisted(() => vi.fn());
const mockResumeDeferred = vi.hoisted(() => vi.fn());
const mockedSendAssistantMessage = vi.mocked(sendAssistantMessage);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return { ...actual, useNavigate: () => mockNavigate };
});

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
      screen.getByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create an assignment")).toBeInTheDocument();
    expect(screen.getByText("Create a quiz")).toBeInTheDocument();
    expect(screen.getByText("Analyse Missing Submissions")).toBeInTheDocument();
    expect(screen.getByText("Draft a student message")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  // Verifies: the assistant's quick actions reach the same destinations as the
  // dashboard's. These two used to only start a chat turn here while the
  // dashboard button under the same label opened the creator, so an instructor
  // got a different tool depending on which surface they clicked from.
  it("opens the assignment and quiz creators from the quick actions", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(screen.getByText("Create an assignment"));
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assignmentCreate);

    mockNavigate.mockClear();
    await user.click(screen.getByText("Create a quiz"));
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.quizCreate);

    // Navigating away is the whole point — it must not also fire a chat turn.
    expect(mockedSendAssistantMessage).not.toHaveBeenCalled();
  });

  // Verifies: the prompt-backed actions run the dashboard's exact prompt. The
  // assistant used to send "Show missing submissions and course performance",
  // which asks for an analysis no tool performs.
  it("sends the dashboard's own prompt for the missing-submissions action", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValue({
      content: "Here is the overview.",
      conversationId: 7,
    });

    renderWithInstitution(<InstructorAssistantPage />);
    await user.click(screen.getByText("Analyse Missing Submissions"));

    await waitFor(() => expect(mockedSendAssistantMessage).toHaveBeenCalled());
    const [, sent] = mockedSendAssistantMessage.mock.calls[0];
    expect(sent).toBe(
      resolveQuickAction("grade-analysis")?.kind === "prompt"
        ? (resolveQuickAction("grade-analysis") as { prompt: string }).prompt
        : "",
    );
    expect(sent).toContain("Analyse missing submissions");
    expect(sent).not.toContain("course performance");
    // Stays in the chat rather than routing anywhere.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Verifies (#1441): Quick actions hide after the user starts chatting.
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
      screen.queryByRole("region", { name: "Quick actions" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Chat" }));

    expect(
      await screen.findByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a quiz")).toBeInTheDocument();
  });

  // Verifies (#1441): Choosing a prompt-backed action also clears the
  // guidance. Uses the analysis action rather than "Create an assignment",
  // which now leaves for the creator page instead of starting a turn here.
  it("hides quick actions after selecting a prompt-backed action", async () => {
    const user = userEvent.setup();
    mockedSendAssistantMessage.mockResolvedValue({
      content: "Two students haven't submitted.",
      conversationId: 7,
      explanation: "Started from a quick action.",
    });

    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(
      screen.getByRole("button", { name: /Analyse Missing Submissions/i }),
    );

    expect(
      await screen.findByText("Two students haven't submitted."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
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

    expect(
      screen.getByRole("region", { name: "Quick actions" }),
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
    // Verifies (#1441): Resume clears starters directly, not only via auto-send.
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
    ).not.toBeInTheDocument();
  });

  // Verifies (#1441): Empty resumed message still hides starters (auto-send would skip).
  it("hides starter prompts when resuming a deferred request with an empty message", async () => {
    const user = userEvent.setup();

    mockListDeferred.mockResolvedValue({
      items: [
        {
          id: 4,
          conversation_id: null,
          message: "",
          proposed_action: null,
          status: "deferred",
          created_at: "2026-07-21T12:04:00.000Z",
          resumed_at: null,
        },
      ],
    });
    mockResumeDeferred.mockResolvedValue({
      id: 4,
      conversation_id: null,
      message: "",
      proposed_action: null,
      status: "deferred",
      created_at: "2026-07-21T12:04:00.000Z",
      resumed_at: null,
    });

    renderWithInstitution(<InstructorAssistantPage />);

    expect(
      await screen.findByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Resume saved request" }),
    );

    await waitFor(() => {
      expect(mockResumeDeferred).toHaveBeenCalledWith("token", 4);
    });
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
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

    expect(
      screen.getByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", {
      name: /Previous conversation/,
    }));

    expect(await screen.findByText("Previous question")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    // Verifies (#1441): Loading history also clears first-time starter guidance.
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New Chat/i }));

    await waitFor(() => {
      expect(screen.queryByText("Previous question")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();
  });
});
