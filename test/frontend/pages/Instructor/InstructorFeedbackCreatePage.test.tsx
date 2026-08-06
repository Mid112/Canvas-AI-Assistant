// Test note: covers the instructor feedback create page.test behavior so future changes can preserve the expected Canvas workflow contract.

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import {
  listTypedDrafts,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import { InstructorFeedbackCreatePage } from "@/pages/Instructor/InstructorFeedbackCreatePage";
import {
  approveFeedbackDraft,
  generateFeedbackDraft,
  previewFeedbackDraft,
} from "@/services/feedbackCreator";
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

vi.mock("@/services/feedbackCreator", () => ({
  FeedbackCreatorApiError: class FeedbackCreatorApiError extends Error {
    name = "FeedbackCreatorApiError";
  },
  generateFeedbackDraft: vi.fn(),
  previewFeedbackDraft: vi.fn(),
  approveFeedbackDraft: vi.fn(),
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

const mockedGenerate = vi.mocked(generateFeedbackDraft);
const mockedPreview = vi.mocked(previewFeedbackDraft);
const mockedApprove = vi.mocked(approveFeedbackDraft);

function renderPage(state?: Record<string, unknown>) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/feedback/create"
        element={<InstructorFeedbackCreatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [
          {
            pathname: "/instructor/feedback/create",
            state,
          },
        ],
      },
    },
  );
}

const reviewSeed = {
  courseId: 42,
  assignmentId: 7,
  studentId: 9,
  assignmentName: "Homework 1",
  studentName: "Alex Student",
  newGrade: "85",
  feedback: "Solid effort on the recursion questions.",
};

describe("InstructorFeedbackCreatePage typed drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGenerate.mockResolvedValue({
      assignmentId: 7,
      studentId: 9,
      assignmentName: "Homework 1",
      studentName: "Alex Student",
      newGrade: "85",
      feedback: "Solid effort on the recursion questions.",
    });
    mockedPreview.mockResolvedValue({
      summary: "Post feedback for Alex Student",
      reversible: true,
      riskLevel: "medium",
      affectedResources: [{ type: "submission", name: "Alex Student" }],
      metadata: {},
    });
    mockedApprove.mockResolvedValue();
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
      screen.getByLabelText("Feedback prompt"),
      "Raw feedback prompt before generation",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText(/Draft saved/i);
    const drafts = listTypedDrafts(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.kind).toBe("feedback");
    expect(drafts[0]?.content).toEqual({
      feedback: "Raw feedback prompt before generation",
    });

    cleanup();
    renderPage({
      typedDraftId: drafts[0]!.id,
      aiFeedbackDraft: {
        courseId: 42,
        prompt: "Raw feedback prompt before generation",
      },
    });

    expect(screen.getByText("Describe the Feedback")).toBeInTheDocument();
    expect(screen.getByLabelText("Feedback prompt")).toHaveValue(
      "Raw feedback prompt before generation",
    );
    expect(screen.queryByLabelText("Feedback comment")).not.toBeInTheDocument();
  });

  it("saves edited review fields and discards the typed draft after Canvas confirm", async () => {
    const user = userEvent.setup();
    const existing = saveTypedDraft(1, {
      kind: "feedback",
      content: {
        assignmentName: "Homework 1",
        studentName: "Alex Student",
        grade: "85",
        feedback: "Solid effort on the recursion questions.",
      },
    });

    renderPage({
      typedDraftId: existing.id,
      aiFeedbackDraft: reviewSeed,
    });

    const comment = await screen.findByLabelText("Feedback comment");
    await waitFor(() =>
      expect(comment).toHaveValue("Solid effort on the recursion questions."),
    );
    await user.clear(comment);
    await user.type(comment, "Edited feedback comment for save");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.content.feedback).toBe("Edited feedback comment for save");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Feedback" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Feedback" }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm & Post" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalled();
    });
    expect(listTypedDrafts(1)).toHaveLength(0);
  });
});
