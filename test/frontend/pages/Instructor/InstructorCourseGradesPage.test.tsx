import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseGradesPage } from "@/pages/Instructor/InstructorCourseGradesPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { previewGradeUpdate, submitGradeUpdate } from "@/services/gradeManagement";
import { fetchAssignmentSubmissions } from "@/services/submissions";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    user: { id: 1, has_canvas_token: true },
  }),
}));

vi.mock("@/hooks/useResolvedInstructorCourse", () => ({
  useResolvedInstructorCourse: () => ({
    course: { id: 7, name: "COSC 777" },
    canvasUrl: "https://canvas.test",
    isLoading: false,
    needsCanvasConnection: false,
  }),
}));

vi.mock("@/services/assignments", () => ({
  fetchCourseAssignments: vi.fn(),
}));

vi.mock("@/services/submissions", () => ({
  fetchAssignmentSubmissions: vi.fn(),
}));

vi.mock("@/services/gradeManagement", () => ({
  previewGradeUpdate: vi.fn(),
  submitGradeUpdate: vi.fn(),
}));

const mockedFetchAssignments = vi.mocked(fetchCourseAssignments);
const mockedFetchSubmissions = vi.mocked(fetchAssignmentSubmissions);
const mockedPreviewGradeUpdate = vi.mocked(previewGradeUpdate);
const mockedSubmitGradeUpdate = vi.mocked(submitGradeUpdate);

function renderPage(path = "/courses/7/grades") {
  return renderWithRouter(
    <Routes>
      <Route path="/courses/:localCourseId/grades" element={<InstructorCourseGradesPage />} />
    </Routes>,
    { routerProps: { initialEntries: [path] } },
  );
}

describe("InstructorCourseGradesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchAssignments.mockResolvedValue([
      {
        id: 10,
        name: "ggg",
        description: null,
        due_at: null,
        points_possible: 100,
        course_id: 7,
        published: true,
      },
    ]);
    mockedFetchSubmissions.mockResolvedValue([
      {
        id: 99,
        assignment_id: 10,
        user_id: 42,
        student_name: "Coin",
        student_email: null,
        student_login_id: null,
        submitted_at: null,
        workflow_state: "submitted",
        status: "submitted",
        score: null,
        grade: null,
        graded_at: null,
      },
    ]);
    mockedPreviewGradeUpdate.mockResolvedValue({
      action: "update_grade",
      risk_level: "high",
      requires_approval: true,
      irreversible_warning: "This grade update is irreversible.",
      rollback_available: true,
      rollback_message: "A previous grade is available for rollback.",
      summary: "Update Coin to 110.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: { posted_grade: "110", reason: null },
      affected_resources: [],
    });
  });

  it("requires preview before submit and shows proposed grades in the New column", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await user.type(screen.getByLabelText("New grade"), "110");

    expect(screen.getByRole("button", { name: "Submit grade change" })).toBeDisabled();
    expect(screen.getByText(/Submit unlocks only after you preview/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview change" }));

    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(1));
    const coinRow = screen.getByRole("row", { name: /Coin Submitted - - 110/i });
    expect(within(coinRow).getByRole("cell", { name: "110" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Type UPDATE to approve"), "UPDATE");
    expect(screen.getByRole("button", { name: "Submit grade change" })).toBeEnabled();
  });

  it("prefills AI handoff details and warns without blocking bonus grades", async () => {
    // Over-max grades are advisory warnings, not hard blockers, because some
    // Canvas assignments intentionally allow bonus/curve scores.
    renderPage("/courses/7/grades?assignmentId=10&studentIds=42&grade=110");

    await screen.findByRole("cell", { name: "Coin" });

    expect(screen.getByLabelText("New grade")).toHaveValue("110");
    expect(screen.getByText(/exceeds this assignment's 100 possible points/i))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview change" })).toBeEnabled();
  });

  it("differentiates unsubmitted students and selects only submitted rows by default", async () => {
    // Manual visits start conservatively, while still showing unsubmitted rows
    // so instructors can opt into paper/in-person grading when appropriate.
    mockedFetchSubmissions.mockResolvedValue([
      {
        id: 99,
        assignment_id: 10,
        user_id: 42,
        student_name: "Coin",
        student_email: null,
        student_login_id: null,
        submitted_at: null,
        workflow_state: "submitted",
        status: "submitted",
        score: null,
        grade: null,
        graded_at: null,
      },
      {
        id: 100,
        assignment_id: 10,
        user_id: 43,
        student_name: "Mn",
        student_email: null,
        student_login_id: null,
        submitted_at: null,
        workflow_state: "unsubmitted",
        status: "unsubmitted",
        score: null,
        grade: null,
        graded_at: null,
      },
    ]);

    renderPage();

    await screen.findByRole("cell", { name: "Mn" });

    expect(screen.getByText("Unsubmitted")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Coin")).toBeChecked();
    expect(screen.getByLabelText("Select Mn")).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Unsubmitted" }));
    expect(screen.getByLabelText("Select Coin")).not.toBeChecked();
    expect(screen.getByLabelText("Select Mn")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Submitted" }));
    expect(screen.getByLabelText("Select Coin")).toBeChecked();
    expect(screen.getByLabelText("Select Mn")).not.toBeChecked();
  });

  it("allows feedback-only submissions without typed grade approval", async () => {
    const user = userEvent.setup();
    mockedPreviewGradeUpdate.mockResolvedValueOnce({
      action: "update_grade",
      risk_level: "low",
      requires_approval: false,
      irreversible_warning: "Feedback only is low risk.",
      rollback_available: false,
      rollback_message: "No grade rollback is needed.",
      summary: "Send feedback to Coin without changing the grade.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: {
        posted_grade: "",
        reason: "Work changes. You can do it.",
      },
      affected_resources: [],
    });
    mockedSubmitGradeUpdate.mockResolvedValueOnce({
      action: "update_grade",
      risk_level: "low",
      requires_approval: false,
      irreversible_warning: "Feedback only is low risk.",
      rollback_available: false,
      rollback_message: "No grade rollback is needed.",
      summary: "Send feedback to Coin without changing the grade.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: {
        posted_grade: "",
        reason: "Work changes. You can do it.",
      },
      affected_resources: [],
      submitted: true,
      history_id: 12,
      canvas_submission: {
        id: 99,
        assignment_id: 10,
        user_id: 42,
        student_name: "Coin",
        student_email: null,
        student_login_id: null,
        submitted_at: null,
        workflow_state: "submitted",
        status: "submitted",
        score: null,
        grade: null,
        graded_at: null,
      },
    });
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await user.type(screen.getByLabelText("Feedback"), "Work changes. You can do it.");

    expect(screen.getByText("Low Risk")).toBeInTheDocument();
    expect(screen.queryByLabelText("Type UPDATE to approve")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview feedback" }));

    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        posted_grade: "",
        reason: "Work changes. You can do it.",
      }),
      "access-token",
      "https://canvas.test",
    ));
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(mockedSubmitGradeUpdate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Feedback sent. History record #12./)).toBeInTheDocument();
  });
});
