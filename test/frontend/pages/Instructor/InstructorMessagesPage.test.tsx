import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorMessagesPage } from "@/pages/Instructor/InstructorMessagesPage";
import { fetchCourseStudentsWithSubmissionFallback } from "@/services/students";
import { fetchMessageDraft } from "@/services/messageDraft";
import { mockMessageDraft } from "@/data/mockMessageDraft";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockUseAuth = vi.fn();
const mockUseActiveCourse = vi.fn();
const mockUseCanvasConnectionUrl = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => mockUseCanvasConnectionUrl(),
}));

vi.mock("@/services/students", () => ({
  StudentApiError: class StudentApiError extends Error {
    name = "StudentApiError";
  },
  fetchCourseStudentsWithSubmissionFallback: vi.fn(),
}));

vi.mock("@/services/messageDraft", () => ({
  MessageDraftApiError: class MessageDraftApiError extends Error {
    name = "MessageDraftApiError";
  },
  isMessageDraftSendMocked: false,
  fetchMessageDraft: vi.fn(),
  fetchSentMessageDrafts: vi.fn(),
  sendMessageDraft: vi.fn(),
}));

vi.mock("@/components/messages/MessageInboxPanel", () => ({
  MessageInboxPanel: ({
    courseId,
    courseLabel,
  }: {
    courseId?: number;
    courseLabel?: string;
  }) =>
    `inbox:${courseId == null ? "all" : courseId}:${courseLabel ?? "none"}`,
}));

vi.mock("@/components/messages/MessageSentPanel", () => ({
  MessageSentPanel: ({
    courseId,
    courseLabel,
  }: {
    courseId?: number;
    courseLabel?: string;
  }) =>
    `sent:${courseId == null ? "all" : courseId}:${courseLabel ?? "none"}`,
}));

const mockedFetchStudents = vi.mocked(fetchCourseStudentsWithSubmissionFallback);
const mockedFetchDraft = vi.mocked(fetchMessageDraft);

function renderMessagesPage(options?: { compose?: boolean }) {
  const initialEntry = options?.compose ? "/?tab=compose" : "/";
  return renderWithRouter(<InstructorMessagesPage />, {
    routerProps: { initialEntries: [initialEntry] },
  });
}

describe("InstructorMessagesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchDraft.mockResolvedValue({
      ...mockMessageDraft,
      recipients: [...mockMessageDraft.recipients],
    });
    mockedFetchStudents.mockResolvedValue([
      {
        id: 1,
        canvas_user_id: "101",
        course_id: 10,
        name: "Alex Student",
        sortable_name: "Student, Alex",
        login_id: "alex@example.edu",
        enrollment_state: "active",
      },
    ]);
    mockUseCanvasConnectionUrl.mockReturnValue("https://canvas.example.edu");
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 10,
        canvasCourseId: 42,
        displayName: "COSC 499",
      },
      availableCourses: [
        {
          id: 10,
          name: "Capstone",
          code: "COSC 499",
          studentCount: 1,
        },
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });
  });

  // #689 / #692 — Messages gating and error workflows
  // Verifies: Without a Canvas token, the connection-required gate is shown.
  it("shows Canvas connection required when the user has no Canvas token", () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: false,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithRouter(<InstructorMessagesPage />);

    expect(
      screen.getByRole("heading", { name: "Connect Canvas to continue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect Canvas to draft messages for your course students.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Without an active course, inbox is still available (all courses).
  it("shows the inbox without requiring an active course", () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    renderWithRouter(<InstructorMessagesPage />);

    expect(
      screen.getByRole("tab", { name: "Inbox & replies" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Announcements" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sent" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compose message" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "View conversations across all courses. Select an active course to compose a new message.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Course label is passed through to inbox; FAB opens compose.
  it("passes the course label to inbox and opens compose from the FAB", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderMessagesPage();

    expect(screen.getByText("inbox:10:COSC 499")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compose message" }));
    expect(await screen.findByLabelText("Subject")).toBeInTheDocument();
  });

  // Verifies: Announcements tab seeds empty-recipients announcement compose.
  it("opens the announcements tab with course announcement compose", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderMessagesPage();

    await user.click(screen.getByRole("tab", { name: "Announcements" }));
    expect(
      await screen.findByRole("heading", { name: "Course announcement" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Subject")).toBeInTheDocument();
  });

  // Verifies: Sent tab mounts the sent panel for the active course.
  it("shows the sent panel for the active course", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderMessagesPage();

    await user.click(screen.getByRole("tab", { name: "Sent" }));
    expect(screen.getByText("sent:10:COSC 499")).toBeInTheDocument();
  });

  // Verifies: AI handoff opens compose, then Cancel/Inbox stay off compose (#1510 review).
  it("opens compose from an AI draft handoff and lets Cancel return to inbox", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithRouter(<InstructorMessagesPage />, {
      routerProps: {
        initialEntries: [
          {
            pathname: "/",
            state: {
              aiMessageDraft: {
                subject: "Handoff subject",
                body: "Handoff body",
                prompt: "Draft a note",
              },
            },
          },
        ],
      },
    });

    // AI handoff should land on compose (subject field present).
    expect(await screen.findByLabelText("Subject")).toBeInTheDocument();
    expect(screen.queryByText("inbox:10:COSC 499")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText("inbox:10:COSC 499")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Sent" }));
    expect(screen.getByText("sent:10:COSC 499")).toBeInTheDocument();
  });

  // Verifies: With course + Canvas, the draft composer loads.
  it("loads the message draft when Canvas and an active course are available", async () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderMessagesPage({ compose: true });

    expect(await screen.findByLabelText("Subject")).toHaveValue(
      "Course Announcement",
    );
  });

  // Regression test for #1509/#1515: an AI message draft resolved to its own
  // course (COSC 499) must not be silently retargeted at whatever course
  // happens to be active (Math 101) when the handoff lands here — the other
  // create pages (assignment/quiz/feedback) got this fix in #1515, but the
  // message compose path read only activeCourse and ignored aiDraft.courseId
  // entirely.
  it("composes against the draft's own course, not the active one", async () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    // Active course is Math 101 (id 20); the draft names COSC 499 (id 10).
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 20,
        canvasCourseId: 43,
        displayName: "Math 101",
      },
      availableCourses: [
        { id: 10, name: "Capstone", code: "COSC 499", studentCount: 1 },
        { id: 20, name: "Calculus", code: "Math 101", studentCount: 5 },
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    renderWithRouter(<InstructorMessagesPage />, {
      routerProps: {
        initialEntries: [
          {
            pathname: "/",
            state: {
              aiMessageDraft: {
                courseId: 10,
                subject: "Reminder",
                body: "Please submit soon.",
              },
            },
          },
        ],
      },
    });

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        10,
        "token",
        "https://canvas.example.edu",
        1,
      );
    });
    expect(
      screen.getByText(/compose a new message for Capstone\./),
    ).toBeInTheDocument();
  });

  // Regression test for PR #1539 review feedback: when the draft's course
  // hasn't shown up in availableCourses yet, composeCourseLabel must not
  // fall back to the active course's name — that would silently mislabel
  // the compose header with the wrong course.
  it("does not label compose with the active course when the draft course is not yet available", () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    // Active course is Math 101 (id 20); the draft names course 10, which
    // has not (yet) loaded into availableCourses.
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 20,
        canvasCourseId: 43,
        displayName: "Math 101",
      },
      availableCourses: [
        { id: 20, name: "Calculus", code: "Math 101", studentCount: 5 },
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    renderWithRouter(<InstructorMessagesPage />, {
      routerProps: {
        initialEntries: [
          {
            pathname: "/",
            state: {
              aiMessageDraft: {
                courseId: 10,
                subject: "Reminder",
                body: "Please submit soon.",
              },
            },
          },
        ],
      },
    });

    expect(
      screen.queryByText(/compose a new message for Math 101\./),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "View conversations across all courses. Select an active course to compose a new message.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Roster failure still shows the draft with an error banner.
  it("shows a roster load error and still renders the draft composer", async () => {
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        name: "Dr. Jane Doe",
        role: "instructor",
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockedFetchStudents.mockRejectedValue(
      new Error("Unable to load course students for messaging."),
    );

    renderMessagesPage({ compose: true });

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load course students for messaging/i),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByLabelText("Subject", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
