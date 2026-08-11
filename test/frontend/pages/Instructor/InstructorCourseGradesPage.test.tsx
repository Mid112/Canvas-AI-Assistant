import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorCourseGradesPage } from "@/pages/Instructor/InstructorCourseGradesPage";
import { fetchCourseAssignments } from "@/services/assignments";
import { previewGradeUpdate, submitGradeUpdate } from "@/services/gradeManagement";
import { fetchAssignmentSubmissions } from "@/services/submissions";
import type { GradeUpdateResult } from "@/types/gradeManagement";
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
        submitted_at: "2026-01-01T00:00:00Z",
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
      rollback_available: false,
      rollback_message: "History is recorded for audit context; use a new grade change for any manual correction.",
      summary: "Update Coin to 110.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: {
        posted_grade: "110",
        feedback: null,
        warnings: ["This grade is above the assignment's 100 possible points; submit only if this is intentional bonus or adjusted grading."],
      },
      affected_resources: [],
    });
  });

  it("requires preview before submit and shows proposed grades in the New column", async () => {
    // Covers the high-risk approval gate: grade submission stays disabled until
    // the instructor previews, reviews warnings, and types the approval phrase.
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await user.type(screen.getByLabelText("New grade"), "110");

    expect(screen.getByRole("button", { name: "Submit grade change" })).toBeDisabled();
    expect(screen.getByText(/Submit unlocks only after you preview/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview change" }));

    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/above the assignment's 100 possible points/i)).toBeInTheDocument();
    expect(mockedPreviewGradeUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        current_submission: expect.objectContaining({
          assignment_points_possible: 100,
        }),
      }),
      "access-token",
      "https://canvas.test",
    );
    const coinRow = screen.getByRole("row", { name: /Coin Submitted - - 110/i });
    expect(within(coinRow).getByRole("cell", { name: "110" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Type UPDATE to approve"), "UPDATE");
    expect(screen.getByRole("button", { name: "Submit grade change" })).toBeEnabled();
  });

  it("prefills AI handoff details and warns without blocking bonus grades", async () => {
    // Covers chat-to-Grades-tab handoff: query params preselect the assignment,
    // student, and grade so the shared approval workflow starts already filled.
    // Over-max grades are advisory warnings, not hard blockers, because some
    // Canvas assignments intentionally allow bonus/curve scores.
    renderPage("/courses/7/grades?assignmentId=10&studentIds=42&grade=110");

    await screen.findByRole("cell", { name: "Coin" });

    expect(screen.getByLabelText("New grade")).toHaveValue("110");
    expect(screen.getByText(/exceeds this assignment's 100 possible points/i))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview change" })).toBeEnabled();
  });

  it.each(["Z", "excused", "0x10"])("rejects unsupported grade value %s before preview", async (grade) => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await user.type(screen.getByLabelText("New grade"), grade);

    expect(screen.getByText(/Use a numeric grade or a supported Canvas grade/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview change" })).toBeDisabled();
    expect(mockedPreviewGradeUpdate).not.toHaveBeenCalled();
  });

  it.each(["satisfactory", "unsatisfactory", "np"])(
    "allows supported Canvas grading scheme value %s before preview",
    async (grade) => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByRole("cell", { name: "Coin" });
      await user.type(screen.getByLabelText("New grade"), grade);

      expect(screen.queryByText(/Use a numeric grade or a supported Canvas grade/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview change" })).toBeEnabled();
    },
  );

  it("filters grade rows and selects all visible students", async () => {
    // Covers bulk workflow ergonomics: filters change which rows are visible,
    // and "All" only selects the currently visible student rows.
    const user = userEvent.setup();
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
        submitted_at: "2026-01-01T00:00:00Z",
        workflow_state: "graded",
        status: "graded",
        score: 88,
        grade: "88",
        graded_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 101,
        assignment_id: 10,
        user_id: 44,
        student_name: "Subby",
        student_email: null,
        student_login_id: null,
        submitted_at: "2026-01-01T00:00:00Z",
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
        status: "missing",
        score: null,
        grade: null,
        graded_at: null,
      },
    ]);

    renderPage();

    await screen.findByRole("cell", { name: "Mn" });

    expect(screen.getByRole("option", { name: "All Statuses" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Graded" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Submitted" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unsubmitted" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Coin Submitted, Graded 88 88 -/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Subby Submitted - - -/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Mn Unsubmitted - - -/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Select Coin")).toBeChecked();
    expect(screen.getByLabelText("Select Subby")).toBeChecked();
    expect(screen.getByLabelText("Select Mn")).not.toBeChecked();

    await user.selectOptions(screen.getByLabelText("Status"), "unsubmitted");
    expect(screen.queryByRole("cell", { name: "Coin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Subby" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Mn" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "submitted");
    expect(screen.getByRole("cell", { name: "Coin" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Subby" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Mn" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "graded");
    expect(screen.getByRole("cell", { name: "Coin" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Subby" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Mn" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "unsubmitted");
    expect(screen.getByRole("cell", { name: "Mn" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("All"));
    expect(screen.getByLabelText("Select Mn")).toBeChecked();

    await user.selectOptions(screen.getByLabelText("Status"), "all");
    expect(screen.getByLabelText("Select Coin")).toBeChecked();
    expect(screen.getByLabelText("Select Mn")).toBeChecked();

    await user.type(screen.getByLabelText("Filter students"), "coin");
    expect(screen.getByRole("cell", { name: "Coin" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Mn" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Filter students"));
    await user.selectOptions(screen.getByLabelText("Status"), "all");
    await user.type(screen.getByLabelText("Grade"), "88");
    expect(screen.getByRole("cell", { name: "Coin" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Mn" })).not.toBeInTheDocument();
  });

  it("refreshes displayed grades from submit results even when Canvas refetch is stale", async () => {
    // Covers the post-submit refresh behavior: the page trusts the Canvas write
    // response first so the table updates even if an immediate refetch is stale.
    const user = userEvent.setup();
    mockedSubmitGradeUpdate.mockResolvedValueOnce({
      action: "update_grade",
      risk_level: "high",
      requires_approval: true,
      irreversible_warning: "This grade update is irreversible.",
      rollback_available: false,
      rollback_message: "History is recorded for audit context; use a new grade change for any manual correction.",
      summary: "Update Coin to 110.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: { posted_grade: "110", feedback: null },
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
        workflow_state: "graded",
        status: "graded",
        score: 110,
        grade: "110",
        graded_at: "2026-01-01T00:00:00Z",
      },
    });
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await user.type(screen.getByLabelText("New grade"), "110");
    await user.type(screen.getByLabelText("Feedback"), "Bonus adjustment");
    await user.click(screen.getByRole("button", { name: "Preview change" }));
    await screen.findByText("Proposed grade: 110");
    await user.type(screen.getByLabelText("Type UPDATE to approve"), "UPDATE");
    await user.click(screen.getByRole("button", { name: "Submit grade change" }));

    expect(await screen.findByText(/Grade updated. History record #12./)).toBeInTheDocument();
    expect(screen.getByLabelText("Feedback")).toHaveValue("");
    // Sentence case matches the shared badge used on every confirm surface;
    // this page previously title-cased its own hand-rolled label.
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Irreversible")).toBeInTheDocument();
    expect(screen.queryByText("Low risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Medium risk")).not.toBeInTheDocument();
    const coinRow = screen.getByRole("row", { name: /Coin Unsubmitted, Graded 110 110 -/i });
    expect(coinRow).toBeInTheDocument();
  });

  it("submits bulk grade changes sequentially to avoid Canvas rate-limit spikes", async () => {
    // Covers the bulk mutation throttle: the page may preview many rows, but
    // Canvas grade writes are submitted one at a time instead of with Promise.all.
    const user = userEvent.setup();
    mockedFetchSubmissions.mockResolvedValue([
      {
        id: 99,
        assignment_id: 10,
        user_id: 42,
        student_name: "Coin",
        student_email: null,
        student_login_id: null,
        submitted_at: "2026-01-01T00:00:00Z",
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
        submitted_at: "2026-01-01T00:00:00Z",
        workflow_state: "submitted",
        status: "submitted",
        score: null,
        grade: null,
        graded_at: null,
      },
    ]);
    mockedPreviewGradeUpdate.mockImplementation(async (_courseId, payload) => ({
      action: "update_grade",
      risk_level: "high",
      requires_approval: true,
      irreversible_warning: "This grade update is irreversible.",
      rollback_available: false,
      rollback_message: "History is recorded for audit context; use a new grade change for any manual correction.",
      summary: `Update student ${payload.user_id} to 95.`,
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: `Student ${payload.user_id}`,
        student_canvas_id: payload.user_id,
      },
      proposed: { posted_grade: "95", feedback: null, warnings: [] },
      affected_resources: [],
    }));
    let resolveFirstSubmit!: (value: GradeUpdateResult) => void;
    const firstSubmit = new Promise<GradeUpdateResult>((resolve) => {
      resolveFirstSubmit = resolve;
    });
    const firstResult: GradeUpdateResult = {
      action: "update_grade",
      risk_level: "high",
      requires_approval: true,
      irreversible_warning: "This grade update is irreversible.",
      rollback_available: false,
      rollback_message: "History is recorded for audit context; use a new grade change for any manual correction.",
      summary: "Update Coin to 95.",
      current: {
        grade: null,
        score: null,
        status: "submitted",
        student_name: "Coin",
        student_canvas_id: 42,
      },
      proposed: { posted_grade: "95", feedback: null },
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
        workflow_state: "graded",
        status: "graded",
        score: 95,
        grade: "95",
        graded_at: "2026-01-01T00:00:00Z",
      },
    };
    const secondResult: GradeUpdateResult = {
      ...firstResult,
      history_id: 13,
      current: { ...firstResult.current, student_name: "Mn", student_canvas_id: 43 },
      summary: "Update Mn to 95.",
      canvas_submission: {
        ...firstResult.canvas_submission,
        id: 100,
        user_id: 43,
        student_name: "Mn",
      },
    };
    mockedSubmitGradeUpdate
      .mockReturnValueOnce(firstSubmit)
      .mockResolvedValueOnce(secondResult);

    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await screen.findByRole("cell", { name: "Mn" });
    await user.type(screen.getByLabelText("New grade"), "95");
    await user.click(screen.getByRole("button", { name: "Preview change" }));
    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(2));
    await user.type(screen.getByLabelText("Type UPDATE to approve"), "UPDATE");
    await user.click(screen.getByRole("button", { name: "Submit grade change" }));

    await waitFor(() => expect(mockedSubmitGradeUpdate).toHaveBeenCalledTimes(1));
    resolveFirstSubmit(firstResult);
    await waitFor(() => expect(mockedSubmitGradeUpdate).toHaveBeenCalledTimes(2));
  });

  it("allows feedback-only submissions without typed grade approval", async () => {
    // Covers the medium-risk feedback path: comments can be previewed and sent
    // without a posted grade or the typed UPDATE confirmation.
    const user = userEvent.setup();
    mockedPreviewGradeUpdate.mockResolvedValueOnce({
      action: "update_grade",
      risk_level: "medium",
      requires_approval: true,
      irreversible_warning: "Feedback only is medium risk.",
      rollback_available: false,
      rollback_message: "History is recorded; no grade correction is needed.",
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
        feedback: "Work changes. You can do it.",
      },
      affected_resources: [],
    });
    mockedSubmitGradeUpdate.mockResolvedValueOnce({
      action: "update_grade",
      risk_level: "medium",
      requires_approval: true,
      irreversible_warning: "Feedback only is medium risk.",
      rollback_available: false,
      rollback_message: "History is recorded; no grade correction is needed.",
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
        feedback: "Work changes. You can do it.",
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

    // Feedback-only now carries the same status as a grade change: it writes a
    // Canvas comment the student sees immediately and there is no undo path,
    // so it is High risk + Irreversible rather than the old emerald
    // "Medium Risk", which read as low risk everywhere else in the app.
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Irreversible")).toBeInTheDocument();
    expect(screen.queryByText("Medium risk")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Type UPDATE to approve")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview feedback" }));

    await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        posted_grade: "",
        feedback: "Work changes. You can do it.",
      }),
      "access-token",
      "https://canvas.test",
    ));
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(mockedSubmitGradeUpdate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Feedback sent. History record #12./)).toBeInTheDocument();
  });

  it("blocks preview when feedback contains profanity before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("cell", { name: "Coin" });
    await waitFor(() => {
      expect(screen.getByLabelText("Select Coin")).toBeChecked();
    });

    await user.type(
      screen.getByLabelText("Feedback"),
      "Please revise this shitty draft carefully.",
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/not appropriate for student communication/i);
    expect(screen.getByRole("button", { name: "Preview feedback" })).toBeDisabled();
    expect(mockedPreviewGradeUpdate).not.toHaveBeenCalled();
  });

  // A relative request ("add 1 mark to everyone who submitted") lands every
  // student on a different number, so the assistant sends per-student targets
  // rather than one grade. Those were parsed off the URL and then used only to
  // work out the selection — the numbers themselves were dropped. The reported
  // symptom was exact: feedback pasted in fine, the New grade box came up
  // empty, and no grade ever changed.
  describe("per-student grade targets from a relative request", () => {
    beforeEach(() => {
      mockedFetchSubmissions.mockResolvedValue([
        {
          id: 99, assignment_id: 10, user_id: 42, student_name: "Coin",
          student_email: null, student_login_id: null,
          submitted_at: "2026-01-01T00:00:00Z", workflow_state: "graded",
          status: "graded", score: 40, grade: "40", graded_at: null,
        },
        {
          id: 100, assignment_id: 10, user_id: 43, student_name: "Robin",
          student_email: null, student_login_id: null,
          submitted_at: "2026-01-01T00:00:00Z", workflow_state: "graded",
          status: "graded", score: 90, grade: "90", graded_at: null,
        },
      ]);
    });

    it("sends each student their own grade instead of one shared value", async () => {
      const user = userEvent.setup();
      renderPage("/courses/7/grades?assignmentId=10&studentGrades=42:41,43:91&feedback=Nice+work.");

      await screen.findByRole("cell", { name: "Coin" });
      await waitFor(() => expect(screen.getByLabelText("Select Coin")).toBeChecked());

      await user.click(screen.getByRole("button", { name: "Preview change" }));

      await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(2));
      const sent = mockedPreviewGradeUpdate.mock.calls.map(([, payload]) => payload);
      expect(sent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user_id: 42, posted_grade: "41", feedback: "Nice work." }),
          expect.objectContaining({ user_id: 43, posted_grade: "91", feedback: "Nice work." }),
        ]),
      );
    });

    it("shows each target in the New column before preview", async () => {
      // An instructor cannot approve what they cannot see, and which mark each
      // student lands on IS the change being approved.
      renderPage("/courses/7/grades?assignmentId=10&studentGrades=42:41,43:91");

      const coinRow = await screen.findByRole("row", { name: /Coin/ });
      const robinRow = screen.getByRole("row", { name: /Robin/ });

      expect(within(coinRow).getByRole("cell", { name: "41" })).toBeInTheDocument();
      expect(within(robinRow).getByRole("cell", { name: "91" })).toBeInTheDocument();
    });

    it("puts a uniform target in the shared box rather than a column of copies", async () => {
      renderPage("/courses/7/grades?assignmentId=10&studentGrades=42:85,43:85");

      await screen.findByRole("cell", { name: "Coin" });
      await waitFor(() => expect(screen.getByLabelText("New grade")).toHaveValue("85"));
    });

    it("lets one typed grade replace every per-student target", async () => {
      // Otherwise the box looks inert: the instructor types 90, submits, and
      // the students who had their own target still get it.
      const user = userEvent.setup();
      renderPage("/courses/7/grades?assignmentId=10&studentGrades=42:41,43:91");

      await screen.findByRole("cell", { name: "Coin" });
      await user.type(screen.getByLabelText("New grade"), "90");
      await user.click(screen.getByRole("button", { name: "Preview change" }));

      await waitFor(() => expect(mockedPreviewGradeUpdate).toHaveBeenCalledTimes(2));
      const sent = mockedPreviewGradeUpdate.mock.calls.map(([, payload]) => payload);
      expect(sent.every((payload) => payload.posted_grade === "90")).toBe(true);
    });

    it("rejects a malformed per-student target before any API call", async () => {
      // Validating only the shared box would let this through the client
      // checks and fail at the API halfway through a batch — some students
      // written, some not.
      renderPage("/courses/7/grades?assignmentId=10&studentGrades=42:41,43:not-a-grade");

      await screen.findByRole("cell", { name: "Coin" });

      expect(
        await screen.findByText(/Use a numeric grade or a supported Canvas grade/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview change" })).toBeDisabled();
      expect(mockedPreviewGradeUpdate).not.toHaveBeenCalled();
    });
  });
});
