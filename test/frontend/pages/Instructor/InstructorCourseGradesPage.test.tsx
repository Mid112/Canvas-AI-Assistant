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

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route path="/courses/:localCourseId/grades" element={<InstructorCourseGradesPage />} />
    </Routes>,
    { routerProps: { initialEntries: ["/courses/7/grades"] } },
  );
}

describe("InstructorCourseGradesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchAssignments.mockResolvedValue([{ id: 10, name: "ggg" }]);
    mockedFetchSubmissions.mockResolvedValue([
      {
        id: 99,
        assignment_id: 10,
        user_id: 42,
        student_name: "Coin",
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
    expect(screen.getByText(/Preview is required before submit/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview change" }));

    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(1));
    const coinRow = screen.getByRole("row", { name: /Coin Submitted - - 110/i });
    expect(within(coinRow).getByRole("cell", { name: "110" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Type UPDATE to approve"), "UPDATE");
    expect(screen.getByRole("button", { name: "Submit grade change" })).toBeEnabled();
  });
});
