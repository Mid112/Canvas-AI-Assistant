/**
 * Ticket 46 / #1507 re-review: when course sync forks a conversation, ChatWindow
 * must follow the fork — not keep posting on a loaded history thread.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";

const mockUseActiveCourse = vi.hoisted(() => vi.fn());
const mockListConversations = vi.hoisted(() => vi.fn());
const mockFetchConversation = vi.hoisted(() => vi.fn());
const mockListDeferred = vi.hoisted(() => vi.fn());
const mockFetchProviders = vi.hoisted(() => vi.fn());
const mockSyncCourseContext = vi.hoisted(() => vi.fn());
const chatPropsLog = vi.hoisted(
  () =>
    [] as Array<{
      initialConversationId?: number;
      loadedConversationId: number | null;
    }>,
);

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "token",
    isAuthenticated: true,
    isLoading: false,
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
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => ({
    selectedInstitution: { id: "ubco", name: "UBC Okanagan" },
    institutions: [],
    isLoading: false,
    selectInstitution: vi.fn(),
    refreshDashboard: vi.fn(),
  }),
}));

vi.mock("@/services/assistant", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/assistant")>(
      "@/services/assistant",
    );
  return {
    ...actual,
    listAssistantConversations: mockListConversations,
    listDeferredAssistantRequests: mockListDeferred,
    fetchConversation: mockFetchConversation,
    resumeDeferredAssistantRequest: vi.fn(),
    sendAssistantMessage: vi.fn(),
    syncAssistantCourseContext: (...args: unknown[]) =>
      mockSyncCourseContext(...args),
  };
});

vi.mock("@/services/instructorLlmProviders", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/instructorLlmProviders")
  >("@/services/instructorLlmProviders");
  return { ...actual, fetchInstructorLlmProviders: mockFetchProviders };
});

vi.mock("@/components/chat/ChatWindow", () => ({
  ChatWindow: (props: {
    initialConversationId?: number;
    loadedConversation?: { id: number } | null;
  }) => {
    chatPropsLog.push({
      initialConversationId: props.initialConversationId,
      loadedConversationId: props.loadedConversation?.id ?? null,
    });
    return (
      <div
        data-testid="chat-window"
        data-initial={props.initialConversationId ?? ""}
        data-loaded={props.loadedConversation?.id ?? ""}
      />
    );
  },
}));

function setActiveLocalId(localId: number) {
  mockUseActiveCourse.mockReturnValue({
    activeCourse: { localId, displayName: `Course ${localId}` },
    availableCourses: [],
    coursesRevision: 0,
    isLoading: false,
    isLoaded: true,
    isSaving: false,
    error: null,
    needsCanvasConnection: false,
    selectActiveCourse: vi.fn(),
    refreshActiveCourse: vi.fn(),
    notifyCoursesChanged: vi.fn(),
  });
}

/** Keeps Assistant mounted while flipping activeCourse.localId for the sync effect. */
function CourseSwitchHarness() {
  const [localId, setLocalId] = useState(1);
  setActiveLocalId(localId);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setLocalId(2)}>
        Switch course
      </button>
      <InstructorAssistantPage />
    </MemoryRouter>
  );
}

describe("InstructorAssistantPage course sync fork adoption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPropsLog.length = 0;
    setActiveLocalId(1);
    mockListDeferred.mockResolvedValue({ items: [] });
    mockFetchProviders.mockResolvedValue({
      default_provider: "ollama",
      default_model: "llama3.2",
      providers: [],
    });
    mockListConversations.mockResolvedValue({
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
      ],
    });
    mockSyncCourseContext.mockImplementation(
      async (
        _token: string,
        options: { conversationId?: number; localCourseId: number },
      ) => ({
        conversationId: options.conversationId ?? 1,
        courseContext: {
          index: 1,
          local_course_id: options.localCourseId,
        },
      }),
    );
  });

  // Verifies (#1507 re-review): adopting a forked id clears loaded history so
  // ChatWindow hydrates from initialConversationId instead of staying on the
  // old thread.
  it("clears loaded history when course sync returns a forked conversation id", async () => {
    const user = userEvent.setup();
    render(<CourseSwitchHarness />);

    await user.click(
      await screen.findByRole("button", { name: /Previous conversation/ }),
    );

    await waitFor(() => {
      expect(
        chatPropsLog.some(
          (entry) =>
            entry.loadedConversationId === 7 &&
            entry.initialConversationId === 7,
        ),
      ).toBe(true);
    });

    mockSyncCourseContext.mockImplementation(
      async (
        _token: string,
        options: { conversationId?: number; localCourseId: number },
      ) => ({
        conversationId:
          options.conversationId === 7 && options.localCourseId === 2
            ? 99
            : (options.conversationId ?? 1),
        courseContext: {
          index: 1,
          local_course_id: options.localCourseId,
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Switch course" }));

    await waitFor(() => {
      expect(mockSyncCourseContext).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({
          localCourseId: 2,
          conversationId: 7,
        }),
      );
    });

    await waitFor(() => {
      const latest = chatPropsLog.at(-1);
      expect(latest?.initialConversationId).toBe(99);
      expect(latest?.loadedConversationId).toBeNull();
    });
  });

  // Verifies (#1507 re-review): selecting history must not re-POST course-context
  // for the active course — that forks and drops the opened transcript.
  it("does not re-sync course context when loading a history conversation", async () => {
    const user = userEvent.setup();
    render(<CourseSwitchHarness />);

    // Fresh visit has no conversation id — sync must not create an empty row.
    await waitFor(() => {
      expect(screen.getByTestId("chat-window")).toBeInTheDocument();
    });
    expect(mockSyncCourseContext).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", { name: /Previous conversation/ }),
    );

    await waitFor(() => {
      expect(
        chatPropsLog.some((entry) => entry.loadedConversationId === 7),
      ).toBe(true);
    });

    // History select alone still must not POST course-context.
    expect(mockSyncCourseContext).not.toHaveBeenCalled();
    expect(chatPropsLog.at(-1)?.loadedConversationId).toBe(7);
  });

  // Verifies (#1507 StoneCA12): visiting Assistant with an active course but no
  // conversation must not POST /chat/course-context (that always creates an
  // empty Conversation and fills history with "No messages yet").
  it("does not create a conversation when syncing course context with no id", async () => {
    render(<CourseSwitchHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-window")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockListDeferred).toHaveBeenCalled();
    });

    expect(mockSyncCourseContext).not.toHaveBeenCalled();
  });
});
