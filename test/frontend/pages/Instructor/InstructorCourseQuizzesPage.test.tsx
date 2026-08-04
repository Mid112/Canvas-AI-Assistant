import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseQuizzesPage } from "@/pages/Instructor/InstructorCourseQuizzesPage";
import { fetchCourseQuizzes, setQuizPublished } from "@/services/quizzes";
import { fetchQuizCapabilities } from "@/services/quizCreator";
import { fetchActiveCourse, fetchCachedCourses, fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  fetchCourses: vi.fn(),
  fetchCachedCourses: vi.fn(),
  fetchActiveCourse: vi.fn(),
  setActiveCourse: vi.fn(),
}));

vi.mock("@/services/quizzes", () => ({
  QuizApiError: class QuizApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  fetchCourseQuizzes: vi.fn(),
  setQuizPublished: vi.fn(),
}));

vi.mock("@/services/quizCreator", () => ({
  fetchQuizCapabilities: vi.fn(),
}));

vi.mock("@/services/assignments", () => ({
  setAssignmentPublished: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchCourseQuizzes = vi.mocked(fetchCourseQuizzes);
const mockedSetQuizPublished = vi.mocked(setQuizPublished);
const mockedFetchQuizCapabilities = vi.mocked(fetchQuizCapabilities);
const mockedFetchCourses = vi.mocked(fetchCourses);
const mockedFetchCachedCourses = vi.mocked(fetchCachedCourses);
const mockedFetchActiveCourse = vi.mocked(fetchActiveCourse);

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const CANVAS_URL = "http://localhost:3000";
const syncedCanvasCourse = {
  canvas_id: 99,
  local_id: 3,
  name: "Introduction to Programming",
  course_code: "CS 101",
  workflow_state: "available",
  total_students: 45,
  term_name: null,
};

const authWithCanvas = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor",
    is_active: true,
    has_canvas_token: true,
    canvas_connections: [
      {
        id: 1,
        canvas_url: CANVAS_URL,
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
};

function renderPage(localCourseId = "3") {
  return renderWithInstitution(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId/quizzes"
        element={<InstructorCourseQuizzesPage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [`/instructor/courses/${localCourseId}/quizzes`],
      },
    },
  );
}

describe("InstructorCourseQuizzesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchActiveCourse.mockResolvedValue(null);
    mockedFetchCourses.mockResolvedValue([syncedCanvasCourse]);
    mockedFetchCachedCourses.mockResolvedValue([syncedCanvasCourse]);
    mockedFetchCourseQuizzes.mockResolvedValue([
      {
        id: 10,
        assignment_id: 1010,
        title: "Recursion Quiz",
        description: null,
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 20,
        course_id: 99,
        quiz_type: "assignment",
        allowed_attempts: 1,
        time_limit: null,
        published: false,
        question_count: 2,
        html_url: null,
        quiz_engine: "classic",
      },
    ]);
    mockedFetchQuizCapabilities.mockResolvedValue({
      classicQuizzes: true,
      newQuizzes: true,
      questionBanks: true,
      preferredEngine: "classic",
    });
  });

  // Verifies: Loads quizzes through the quiz list API, not assignments.
  it("loads quizzes and publishes via the quiz publish API", async () => {
    const user = userEvent.setup();
    mockedSetQuizPublished.mockResolvedValue({
      id: 10,
      assignment_id: 1010,
      title: "Recursion Quiz",
      description: null,
      due_at: "2026-12-15T12:00:00.000Z",
      points_possible: 20,
      course_id: 99,
      quiz_type: "assignment",
      allowed_attempts: 1,
      time_limit: null,
      published: true,
      question_count: 2,
      html_url: null,
      quiz_engine: "classic",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Recursion Quiz")).toBeInTheDocument();
    });

    expect(mockedFetchCourseQuizzes).toHaveBeenCalledWith(3, "token", CANVAS_URL);
    expect(screen.getByText("Unpublished")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockedSetQuizPublished).toHaveBeenCalledWith(3, 10, true, "token", {
        canvasUrl: CANVAS_URL,
        quizEngine: "classic",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Unpublished")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    });
  });

  // Verifies: Canvas quiz unpublish refusals are shown without assignment APIs.
  it("shows Canvas quiz unpublish refusal errors", async () => {
    const user = userEvent.setup();
    const { QuizApiError } = await import("@/services/quizzes");
    mockedFetchCourseQuizzes.mockResolvedValue([
      {
        id: 10,
        assignment_id: 1010,
        title: "Recursion Quiz",
        description: null,
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 20,
        course_id: 99,
        quiz_type: "assignment",
        allowed_attempts: 1,
        time_limit: null,
        published: true,
        question_count: 2,
        html_url: null,
        quiz_engine: "classic",
      },
    ]);
    mockedSetQuizPublished.mockRejectedValue(
      new QuizApiError(
        "Canvas refused to unpublish this quiz. Canvas API error: 400 - Can't unpublish if there are student submissions",
        502,
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Canvas refused to unpublish this quiz",
    );
  });

  // Verifies: Classic and New Quiz rows stay distinct when Canvas ids collide.
  it("renders classic and New Quiz with the same id as separate rows", async () => {
    mockedFetchCourseQuizzes.mockResolvedValue([
      {
        id: 42,
        assignment_id: 4242,
        title: "Shared Id Classic Quiz",
        description: null,
        due_at: "2026-12-15T12:00:00.000Z",
        points_possible: 20,
        course_id: 99,
        quiz_type: "assignment",
        allowed_attempts: 1,
        time_limit: null,
        published: true,
        question_count: 2,
        html_url: null,
        quiz_engine: "classic",
      },
      {
        id: 42,
        assignment_id: 42,
        title: "Shared Id New Quiz",
        description: null,
        due_at: "2026-12-16T12:00:00.000Z",
        points_possible: 15,
        course_id: 99,
        quiz_type: "new_quizzes",
        allowed_attempts: 1,
        time_limit: null,
        published: true,
        question_count: 3,
        html_url: null,
        quiz_engine: "new_quizzes",
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Shared Id Classic Quiz")).toBeInTheDocument();
      expect(screen.getByText("Shared Id New Quiz")).toBeInTheDocument();
    });

    expect(screen.getByText(/Classic · ID: 42/)).toBeInTheDocument();
    expect(screen.getByText(/New Quizzes · ID: 42/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unpublish" })).toHaveLength(
      2,
    );
  });

  // Verifies: Ticket 13 review — New Quizzes soft-fail is visible, not silent.
  it("shows a notice when New Quizzes capabilities are unavailable", async () => {
    mockedFetchQuizCapabilities.mockResolvedValue({
      classicQuizzes: true,
      newQuizzes: false,
      questionBanks: false,
      preferredEngine: "classic",
      newQuizzesUnavailableReason:
        "New Quizzes API returned 403 for this course.",
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("New Quizzes API returned 403 for this course."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Recursion Quiz")).toBeInTheDocument();
  });
});
