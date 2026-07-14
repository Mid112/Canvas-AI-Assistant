import { screen, waitFor } from "@testing-library/react";
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
  sendMessageDraft: vi.fn(),
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

  // Verifies: Without an active course, the page asks the instructor to select one.
  it("asks the instructor to select an active course when none is set", () => {
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
      screen.getByText(
        "Select an active course to view messages and draft new ones.",
      ),
    ).toBeInTheDocument();
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
      mockMessageDraft.subject,
    );
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
    expect(await screen.findByLabelText("Subject")).toBeInTheDocument();
  });
});
