/** Resuming a saved draft must land on the course the draft was written for.
 *
 * Reported in manual QA: the assistant resolved "COSC 499" correctly and
 * produced a preview, but saving that preview as a draft and resuming it
 * opened the create form on whichever course happened to be active at resume
 * time. Switching the active course in between silently retargeted the draft.
 *
 * The cause was that drafts stored no course at all — stripCanvasIdentifiers
 * keeps ids out of local storage (#1239) — so the resume handler seeded
 * activeCourse.localId unconditionally. Drafts now persist the course's two
 * display labels and resolve them back to an id here.
 *
 * These live in their own file because they mock useActiveCourse, which the
 * main InstructorAssistantPage suite deliberately drives through the real
 * provider.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveTypedDraft } from "@/lib/typed-draft-storage";
import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseActiveCourse = vi.hoisted(() => vi.fn());
const mockUseInstitution = vi.hoisted(() => vi.fn());
const mockListDeferred = vi.hoisted(() => vi.fn());
const mockListConversations = vi.hoisted(() => vi.fn());
const mockFetchProviders = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 7,
      email: "professor@university.edu",
      name: "Professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 1,
          canvas_url: "https://canvas.university.edu",
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
  useInstitution: () => mockUseInstitution(),
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
    fetchConversation: vi.fn(),
    resumeDeferredAssistantRequest: vi.fn(),
    sendAssistantMessage: vi.fn(),
  };
});

vi.mock("@/services/instructorLlmProviders", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/instructorLlmProviders")>(
      "@/services/instructorLlmProviders",
    );
  return { ...actual, fetchInstructorLlmProviders: mockFetchProviders };
});

function course(
  id: number,
  code: string,
  name: string,
): InstructorCourse {
  return {
    id,
    canvasCourseId: id * 10,
    canvasUrl: "https://canvas.university.edu",
    code,
    name,
    progress: 0,
    studentCount: 0,
    assignmentCount: 0,
    lastActivity: "",
    isPublished: true,
    isWritable: true,
    term: null,
  };
}

const capstone = course(3, "COSC 499", "Capstone Project");
const calculus = course(4, "MATH 101", "Calculus");

function setCourseContext(options: {
  activeLocalId: number | null;
  available?: InstructorCourse[];
}) {
  mockUseActiveCourse.mockReturnValue({
    activeCourse:
      options.activeLocalId === null
        ? null
        : { localId: options.activeLocalId, displayName: "Active course" },
    availableCourses: options.available ?? [capstone, calculus],
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

/** Saves an assignment draft bound to a course, the way the create page does. */
function saveCapstoneDraft() {
  return saveTypedDraft(7, {
    kind: "assignment",
    content: {
      title: "Instance Segmentation",
      body: "Compare CNN and transformer approaches.",
      courseCode: capstone.code,
      courseName: capstone.name,
    },
  });
}

async function resumeFirstDraft() {
  const user = userEvent.setup();
  renderWithRouter(<InstructorAssistantPage />);

  await user.click(await screen.findByRole("button", { name: /Saved drafts/ }));
  await user.click(await screen.findByRole("button", { name: "Resume" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockListConversations.mockResolvedValue({ items: [], total: 0 });
  mockListDeferred.mockResolvedValue({ items: [] });
  mockFetchProviders.mockResolvedValue({
    default_provider: "ollama",
    default_model: "llama3.2",
    providers: [],
  });
  mockUseInstitution.mockReturnValue({
    selectedInstitution: { id: "ubco", name: "UBC Okanagan" },
    institutions: [],
    setSelectedInstitution: vi.fn(),
    dashboardData: null,
    refreshDashboard: vi.fn(),
  });
  setCourseContext({ activeLocalId: capstone.id });
});

describe("resuming a typed draft's course", () => {
  // The reported bug, directly: the draft was written against Capstone while
  // Calculus is now active. Resume must open Capstone.
  it("uses the draft's own course, not the active one", async () => {
    saveCapstoneDraft();
    setCourseContext({ activeLocalId: calculus.id });

    await resumeFirstDraft();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const [, options] = mockNavigate.mock.calls[0];
    const state = options.state as {
      aiAssignmentDraft: { courseId?: number };
    };
    expect(state.aiAssignmentDraft.courseId).toBe(capstone.id);
    expect(state.aiAssignmentDraft.courseId).not.toBe(calculus.id);
  });

  // Renaming a course between save and resume must not break the binding —
  // the stored code still identifies it.
  it("still resolves after the course was renamed", async () => {
    saveCapstoneDraft();
    setCourseContext({
      activeLocalId: calculus.id,
      available: [course(3, "COSC 499", "Senior Design"), calculus],
    });

    await resumeFirstDraft();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const [, options] = mockNavigate.mock.calls[0];
    const state = options.state as {
      aiAssignmentDraft: { courseId?: number };
    };
    expect(state.aiAssignmentDraft.courseId).toBe(3);
  });

  // A draft saved before this change carries no labels; the active course is
  // still the only signal available, so the old behaviour stands.
  it("falls back to the active course for drafts with no stored course", async () => {
    saveTypedDraft(7, {
      kind: "assignment",
      content: { title: "Legacy draft", body: "No course stored" },
    });
    setCourseContext({ activeLocalId: calculus.id });

    await resumeFirstDraft();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const [, options] = mockNavigate.mock.calls[0];
    const state = options.state as {
      aiAssignmentDraft: { courseId?: number };
    };
    expect(state.aiAssignmentDraft.courseId).toBe(calculus.id);
  });

  // A self-describing draft no longer needs an active course at all, so the
  // "select an active course" gate must not block it.
  it("resumes with no active course when the draft names its own", async () => {
    saveCapstoneDraft();
    setCourseContext({ activeLocalId: null });

    renderWithRouter(<InstructorAssistantPage />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Saved drafts/ }),
    );

    expect(
      screen.queryByText(/Select an active course before resuming/),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const [, options] = mockNavigate.mock.calls[0];
    const state = options.state as {
      aiAssignmentDraft: { courseId?: number };
    };
    expect(state.aiAssignmentDraft.courseId).toBe(capstone.id);
  });

  // Nothing to resolve and nothing active: the gate still applies.
  it("still asks for a course when neither the draft nor the app has one", async () => {
    saveTypedDraft(7, {
      kind: "assignment",
      content: { title: "Legacy draft", body: "No course stored" },
    });
    setCourseContext({ activeLocalId: null });

    renderWithRouter(<InstructorAssistantPage />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Saved drafts/ }),
    );

    expect(
      await screen.findByText(/Select an active course before resuming/),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
