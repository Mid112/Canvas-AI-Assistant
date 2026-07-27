import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import {
  listTypedDrafts,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import { InstructorQuizCreatePage } from "@/pages/Instructor/InstructorQuizCreatePage";
import {
  approveQuizDraft,
  fetchQuizCapabilities,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    user: {
      id: 1,
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
  }),
}));

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => "https://canvas.university.edu",
}));

vi.mock("@/services/quizCreator", () => ({
  QuizCreatorApiError: class QuizCreatorApiError extends Error {
    name = "QuizCreatorApiError";
  },
  generateQuizDraft: vi.fn(),
  previewQuizDraft: vi.fn(),
  approveQuizDraft: vi.fn(),
  fetchQuizCapabilities: vi.fn(),
  fetchQuestionBanks: vi.fn(),
}));

const course: InstructorCourse = {
  id: 42,
  canvasCourseId: 101,
  canvasUrl: "https://canvas.university.edu",
  code: "CS 101",
  name: "Introduction to Programming",
  progress: 0,
  studentCount: 35,
  assignmentCount: 0,
  lastActivity: "",
  isPublished: true,
  isWritable: true,
  term: null,
};

const mockUseActiveCourse = vi.fn();
const mockUseInstitution = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => mockUseInstitution(),
}));

const mockedGenerate = vi.mocked(generateQuizDraft);
const mockedPreview = vi.mocked(previewQuizDraft);
const mockedApprove = vi.mocked(approveQuizDraft);
const mockedCapabilities = vi.mocked(fetchQuizCapabilities);

function renderPage(state?: Record<string, unknown>) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/quizzes/create"
        element={<InstructorQuizCreatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [
          {
            pathname: "/instructor/quizzes/create",
            state,
          },
        ],
      },
    },
  );
}

const reviewSeed = {
  courseId: 42,
  name: "Old Quiz Title",
  description: "Old quiz instructions",
  dueDate: "2026-12-15T23:59",
  pointsPossible: 10,
  allowedAttempts: 1,
  timeLimit: null,
  quizEngine: "classic" as const,
  questions: [
    {
      questionText: "What is 2+2?",
      questionType: "multiple_choice_question" as const,
      pointsPossible: 10,
      answers: [
        { text: "4", weight: 100 },
        { text: "5", weight: 0 },
      ],
    },
  ],
  questionBankGroups: [],
};

describe("InstructorQuizCreatePage typed drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGenerate.mockResolvedValue({
      name: "Generated Quiz",
      description: "Generated instructions",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 10,
      allowedAttempts: 1,
      timeLimit: null,
      quizEngine: "classic",
      questions: reviewSeed.questions,
      questionBankGroups: [],
    });
    mockedPreview.mockResolvedValue({
      summary: "Create quiz in CS 101",
      reversible: true,
      riskLevel: "medium",
      affectedResources: [{ type: "quiz", name: "Old Quiz Title" }],
      metadata: {},
    });
    mockedApprove.mockResolvedValue();
    mockedCapabilities.mockResolvedValue({
      classicQuizzes: true,
      newQuizzes: false,
      questionBanks: false,
      preferredEngine: "classic",
    });
    mockUseActiveCourse.mockReturnValue({
      availableCourses: [course],
      activeCourse: course,
      isLoading: false,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });
    mockUseInstitution.mockReturnValue({
      refreshDashboard: vi.fn(),
    });
  });

  it("saves a describe-step prompt as a typed draft and resumes to describe", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText("Quiz description"),
      "Raw quiz prompt before generation",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText(/Draft saved/i);
    const drafts = listTypedDrafts(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.kind).toBe("quiz");
    expect(drafts[0]?.content).toEqual({
      questions: "Raw quiz prompt before generation",
    });

    cleanup();
    renderPage({
      typedDraftId: drafts[0]!.id,
      aiQuizDraft: {
        courseId: 42,
        prompt: "Raw quiz prompt before generation",
      },
    });

    expect(screen.getByText("Describe Your Quiz")).toBeInTheDocument();
    expect(screen.getByLabelText("Quiz description")).toHaveValue(
      "Raw quiz prompt before generation",
    );
    expect(screen.queryByLabelText("Quiz title")).not.toBeInTheDocument();
  });

  it("saves edited review fields and discards the typed draft after Canvas confirm", async () => {
    const user = userEvent.setup();
    const existing = saveTypedDraft(1, {
      kind: "quiz",
      content: { title: "Old Quiz Title", body: "Old quiz instructions" },
    });

    renderPage({
      typedDraftId: existing.id,
      aiQuizDraft: reviewSeed,
    });

    const titleInput = await screen.findByLabelText("Quiz title");
    await waitFor(() => expect(titleInput).toHaveValue("Old Quiz Title"));
    await user.clear(titleInput);
    await user.type(titleInput, "Edited Quiz Title");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.content.title).toBe("Edited Quiz Title");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalled();
    });
    expect(listTypedDrafts(1)).toHaveLength(0);
  });
});
