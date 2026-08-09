import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setStoredDeferredDraft } from "@/lib/deferred-assistant-storage";
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
    syncAssistantCourseContext: vi.fn().mockResolvedValue({
      conversationId: 1,
      courseContext: { index: 1, local_course_id: 1 },
    }),
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
    // Verifies (#1454): History stays collapsed so chat remains the primary surface.
    expect(
      screen.getByRole("button", { name: /Conversation History \(0\)/ }),
    ).toHaveAttribute("aria-expanded", "false");
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
      resolveQuickAction("analyse-missing-submissions")?.kind === "prompt"
        ? (resolveQuickAction("analyse-missing-submissions") as { prompt: string }).prompt
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

    await user.click(
      await screen.findByRole("button", { name: /Saved drafts \(3\)/ }),
    );
    const resumeButtons = await screen.findAllByRole("button", {
      name: "Resume",
    });
    expect(resumeButtons.length).toBeGreaterThan(0);

    expect(
      screen.getByRole("region", { name: "Quick actions" }),
    ).toBeInTheDocument();

    await user.click(resumeButtons[0]!);

    await waitFor(() => {
      expect(mockResumeDeferred).toHaveBeenCalledTimes(1);
    });
    expect(mockResumeDeferred).toHaveBeenCalledWith("token", 3);
    // Resume peeks without consuming — queue stays until chat send succeeds.
    expect(
      await screen.findByRole("button", { name: /Saved drafts \(3\)/ }),
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
      await screen.findByRole("button", { name: /Saved drafts \(1\)/ }),
    );
    await user.click(screen.getByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(mockResumeDeferred).toHaveBeenCalledWith("token", 4);
    });
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
    ).not.toBeInTheDocument();
  });

  // Verifies the review fix for #1454: auto-restoring a locally cached
  // deferred draft after Canvas connects must hide starters too, the same
  // way the explicit "Resume" action does.
  it("hides starter prompts when a locally cached deferred draft auto-restores after Canvas connects", async () => {
    setStoredDeferredDraft(1, { message: "Auto-restored draft message" });
    mockListDeferred.mockResolvedValue({ items: [] });

    renderWithInstitution(<InstructorAssistantPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Chat message" }),
      ).toHaveValue("Auto-restored draft message");
    });
    expect(
      screen.queryByRole("region", { name: "Starter prompts" }),
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

    await user.click(
      await screen.findByRole("button", {
        name: /Conversation History \(1\)/,
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: /Previous conversation/,
      }),
    );

    expect(await screen.findByText("Previous question")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    // Verifies (#1441): Loading history also clears first-time starter guidance.
    expect(
      screen.queryByRole("region", { name: "Quick actions" }),
    ).not.toBeInTheDocument();

    // Exact name: the tab strip's "+" is labelled "New chat tab", which a
    // case-insensitive /New Chat/ also matches.
    await user.click(screen.getByRole("button", { name: "New Chat" }));

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

// The rules themselves are covered in lib/chat-tabs.test.ts. These check the
// wiring: that the strip is mounted, its controls reach the reducers, and the
// hook's persistence survives leaving the page.
describe("InstructorAssistantPage chat tabs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens on a single tab with no close control", () => {
    renderWithInstitution(<InstructorAssistantPage />);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
  });

  it("adds a tab from + without discarding the current one", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(screen.getByRole("button", { name: "New chat tab" }));

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "New chat (2)",
    );
    // A second tab means closing is now possible on both.
    expect(screen.getAllByRole("button", { name: /^Close / })).toHaveLength(2);
  });

  // The chat's own New Chat button and the strip's + are the same action, so
  // New Chat opens a tab rather than silently reusing the current one.
  it("treats the chat's New Chat button as opening a tab", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);

    await user.click(screen.getByRole("button", { name: "New Chat" }));

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
  });

  it("brings the strip back after leaving and returning to the page", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);
    await user.click(screen.getByRole("button", { name: "New chat tab" }));
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    cleanup();
    renderWithInstitution(<InstructorAssistantPage />);

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
  });

  // History moved from a full-width band above the chat to a column beside it,
  // so it costs horizontal space only while open instead of vertical space
  // always. Collapsed it is a rail, not nothing -- a panel with no handle is a
  // panel nobody finds again.
  it("collapses conversation history to a rail and expands it back", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);

    const rail = await screen.findByRole("button", {
      name: /Conversation History \(0\)/,
    });
    expect(rail).toHaveAttribute("aria-expanded", "false");

    await user.click(rail);

    expect(
      await screen.findByRole("heading", {
        name: /Conversation History \(0\)/,
      }),
    ).toBeInTheDocument();
    // Refresh only exists while the panel is open, so it doubles as proof the
    // expanded body rendered rather than just the heading.
    expect(
      screen.getByRole("button", { name: "Refresh conversation history" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse conversation history" }),
    );

    expect(
      await screen.findByRole("button", {
        name: /Conversation History \(0\)/,
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("closes a tab from its x", async () => {
    const user = userEvent.setup();
    renderWithInstitution(<InstructorAssistantPage />);
    await user.click(screen.getByRole("button", { name: "New chat tab" }));
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: "Close New chat" }));

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
  });
});
