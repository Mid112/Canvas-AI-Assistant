/**
 * Regression: switching course must not put the page in a render loop.
 *
 * ActiveCourseProvider rebuilds selectActiveCourse whenever the active course
 * changes, because the callback closes over it. An effect that both depends on
 * that function and calls it therefore re-fires on its own result — the page
 * "reloaded in a loop and shook". The mock below reproduces the churn
 * faithfully: a new selectActiveCourse identity on every single render.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";

const selectActiveCourseSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue(true),
);
const activeLocalId = vi.hoisted(() => ({ current: 1 }));
const pendingWork = vi.hoisted(() => ({ current: false }));
const renderCount = vi.hoisted(() => ({ current: 0 }));

// Hoisted to a constant because AuthProvider memoises its value. A mock that
// rebuilt this per call would hand back a new `user` on every render, and the
// page's provider-loading effect depends on `user` — that alone spins, with
// nothing to do with tabs. Measuring the harness instead of the page is the
// trap this whole file exists to avoid.
const authValue = vi.hoisted(() => ({
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
    canvas_connections: [],
  },
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authValue,
}));

// Mirrors ActiveCourseProvider's actual memoisation: the context value — and
// with it selectActiveCourse — is rebuilt when the active course changes, and
// only then. Rebuilding it on every render instead would make this harness
// churnier than the real app and measure the harness rather than the page.
const contextByCourse = vi.hoisted(() => new Map<number, unknown>());

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => {
    const localId = activeLocalId.current;
    if (!contextByCourse.has(localId)) {
      contextByCourse.set(localId, {
        activeCourse: { localId, displayName: `Course ${localId}` },
        availableCourses: [
          { id: 1, code: "C1", name: "Course 1" },
          { id: 2, code: "C2", name: "Course 2" },
        ],
        coursesRevision: 0,
        isLoading: false,
        isLoaded: true,
        isSaving: false,
        error: null,
        needsCanvasConnection: false,
        // New identity per course, exactly as the real callback gets: it
        // closes over activeCourse, so it cannot outlive a course change.
        selectActiveCourse: (...args: unknown[]) =>
          selectActiveCourseSpy(...args),
        refreshActiveCourse: vi.fn(),
        notifyCoursesChanged: vi.fn(),
      });
    }
    return contextByCourse.get(localId);
  },
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
    listAssistantConversations: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
    }),
    listDeferredAssistantRequests: vi.fn().mockResolvedValue({ items: [] }),
    fetchConversation: vi.fn(),
    resumeDeferredAssistantRequest: vi.fn(),
    sendAssistantMessage: vi.fn(),
    syncAssistantCourseContext: vi.fn().mockResolvedValue({
      conversationId: 55,
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
    fetchInstructorLlmProviders: vi.fn().mockResolvedValue({
      default_provider: "ollama",
      default_model: "llama3.2",
      providers: [],
    }),
  };
});

vi.mock("@/components/chat/ChatWindow", () => ({
  ChatWindow: (props: { onPendingWorkChange?: (value: boolean) => void }) => {
    renderCount.current += 1;
    // The page reads pending work to decide foreground vs background.
    if (pendingWork.current) {
      props.onPendingWorkChange?.(true);
    }
    return <div data-testid="chat-window" />;
  },
}));

/** Keeps the page mounted while the active course flips underneath it. */
function CourseSwitchHarness() {
  const [, force] = useState(0);
  return (
    <MemoryRouter>
      <button
        type="button"
        onClick={() => {
          activeLocalId.current = 2;
          force((count) => count + 1);
        }}
      >
        Switch course
      </button>
      <InstructorAssistantPage />
    </MemoryRouter>
  );
}

describe("InstructorAssistantPage tab routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    contextByCourse.clear();
    activeLocalId.current = 1;
    pendingWork.current = false;
    renderCount.current = 0;
  });

  // The loop showed up as the chat remounting over and over. A settled page
  // renders it a small, bounded number of times; a looping one climbs without
  // limit (or trips React's max update depth).
  it("settles after the first course is adopted", async () => {
    render(<CourseSwitchHarness />);

    await screen.findByTestId("chat-window");
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));

    const settled = renderCount.current;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderCount.current).toBe(settled);
    // The first course is adopted by the tab already open, so nothing needs
    // pushing back into the dropdown.
    expect(selectActiveCourseSpy).not.toHaveBeenCalled();
  });

  it("settles after switching to another course", async () => {
    const user = userEvent.setup();
    render(<CourseSwitchHarness />);
    await screen.findByTestId("chat-window");

    await user.click(screen.getByRole("button", { name: "Switch course" }));

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    const settled = renderCount.current;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderCount.current).toBe(settled);
    // Nothing to correct: the new tab took focus, so the dropdown already
    // agrees with the tab in front of the instructor.
    expect(selectActiveCourseSpy).not.toHaveBeenCalled();
  });

  // The loop as reported: "switch a course and the page keeps reloading and it
  // shakes". Tabs outlive a session, so a stored one can name a course that is
  // gone — unenrolled, unpublished, or wiped with the Canvas sandbox.
  // Selecting it fails and ActiveCourseProvider rolls the active course back,
  // which reads as another switch, so it gets retried: flicker, forever.
  it("does not chase a stored tab whose course no longer exists", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "assistant-chat-tabs:1",
      JSON.stringify({
        tabs: [
          {
            id: "stale-tab",
            courseId: 99,
            courseName: "Deleted Course",
            conversationId: null,
            createdSeq: 0,
            focusedSeq: 0,
          },
        ],
        activeTabId: "stale-tab",
        nextSeq: 1,
      }),
    );

    render(<CourseSwitchHarness />);
    await screen.findByTestId("chat-window");
    // The stale tab is kept — it is the instructor's thread, and its label is
    // stored text, not a live lookup. The active course simply gets its own.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Deleted Course" })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    // Clicking it is the path that asks for the missing course by id. Without
    // the availability guard this reaches selectActiveCourse, the server
    // rejects it, and the provider's rollback restarts the whole cycle.
    await user.click(screen.getByRole("tab", { name: "Deleted Course" }));

    const settled = renderCount.current;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderCount.current).toBe(settled);
    expect(selectActiveCourseSpy).not.toHaveBeenCalledWith(99);
  });

  // Scenario 2: an unconfirmed preview is open, so the new course's tab opens
  // behind it. The dropdown is put back exactly once — and that correction must
  // not itself be treated as a switch, or the two chase each other.
  it("puts the dropdown back once when a tab opens in the background", async () => {
    const user = userEvent.setup();
    pendingWork.current = true;
    render(<CourseSwitchHarness />);
    await screen.findByTestId("chat-window");

    await user.click(screen.getByRole("button", { name: "Switch course" }));

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    // Still on the original tab: the preview was not disturbed.
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "Course 1",
    );

    await waitFor(() => expect(selectActiveCourseSpy).toHaveBeenCalledWith(1));

    const settled = renderCount.current;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderCount.current).toBe(settled);
    expect(selectActiveCourseSpy).toHaveBeenCalledTimes(1);
  });
});
