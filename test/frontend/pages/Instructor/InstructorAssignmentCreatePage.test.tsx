import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

import {
  InstructorAssignmentCreatePage,
  InstructorAssignmentCreateRoute,
} from "@/pages/Instructor/InstructorAssignmentCreatePage";
import {
  listTypedDrafts,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import {
  approveAssignmentDraft,
  generateAssignmentDraft,
  previewAssignmentDraft,
} from "@/services/assignmentCreator";
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

const canvasUrlHolder = vi.hoisted(() => ({
  current: "https://canvas.university.edu" as string | undefined,
}));

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => canvasUrlHolder.current,
}));

vi.mock("@/services/assignmentCreator", () => ({
  AssignmentCreatorApiError: class AssignmentCreatorApiError extends Error {
    name = "AssignmentCreatorApiError";
  },
  generateAssignmentDraft: vi.fn(),
  previewAssignmentDraft: vi.fn(),
  approveAssignmentDraft: vi.fn(),
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

const mockedGenerate = vi.mocked(generateAssignmentDraft);
const mockedPreview = vi.mocked(previewAssignmentDraft);
const mockedApprove = vi.mocked(approveAssignmentDraft);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderPage(state?: Record<string, unknown>) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/assignments/create"
        element={<InstructorAssignmentCreatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [
          {
            pathname: "/instructor/assignments/create",
            state,
          },
        ],
      },
    },
  );
}

describe("InstructorAssignmentCreatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canvasUrlHolder.current = "https://canvas.university.edu";
    mockedGenerate.mockResolvedValue({
      name: "Python Functions Quiz",
      description: "Complete a short quiz covering functions.",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 50,
    });
    mockedPreview.mockResolvedValue({
      summary: "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      reversible: true,
      affectedResources: [{ type: "assignment", name: "Python Functions Quiz" }],
    });
    mockedApprove.mockResolvedValue();
    mockUseActiveCourse.mockReturnValue({
      availableCourses: [course],
      isLoading: false,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });
    mockUseInstitution.mockReturnValue({
      refreshDashboard: vi.fn(),
    });
  });

  it("walks through describe, review, preview, and approve steps", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("heading", { name: "AI Assignment Creator" })).toBeInTheDocument();
    expect(screen.getByText("Describe Assignment")).toBeInTheDocument();
    expect(
      await screen.findByRole("option", {
        name: "CS 101: Introduction to Programming",
      }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    await waitFor(() => {
      expect(mockedGenerate).toHaveBeenCalledWith(
        42,
        "Create a quiz on Python functions and parameters for beginners.",
        { accessToken: "access-token", canvasUrl: "https://canvas.university.edu" },
      );
    });

    expect(await screen.findByLabelText("Assignment title")).toHaveValue(
      "Python Functions Quiz",
    );

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        {
          courseId: "42",
          name: "Python Functions Quiz",
          description: "Complete a short quiz covering functions.",
          dueDate: "2026-12-15T23:59",
          pointsPossible: 50,
        },
        {
          accessToken: "access-token",
          canvasUrl: "https://canvas.university.edu",
        },
      );
    });

    expect(mockedApprove).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(
        {
          courseId: "42",
          name: "Python Functions Quiz",
          description: "Complete a short quiz covering functions.",
          dueDate: "2026-12-15T23:59",
          pointsPossible: 50,
        },
        {
          accessToken: "access-token",
          canvasUrl: "https://canvas.university.edu",
        },
      );
    });

    expect(await screen.findByText("Assignment Approved")).toBeInTheDocument();
  });

  it("passes instructor edits through preview to approveAssignmentDraft", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    const titleInput = await screen.findByLabelText("Assignment title");
    await user.clear(titleInput);
    await user.type(titleInput, "Edited Quiz Title");

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        {
          courseId: "42",
          name: "Edited Quiz Title",
          description: "Complete a short quiz covering functions.",
          dueDate: "2026-12-15T23:59",
          pointsPossible: 50,
        },
        {
          accessToken: "access-token",
          canvasUrl: "https://canvas.university.edu",
        },
      );
    });

    await user.click(await screen.findByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(
        {
          courseId: "42",
          name: "Edited Quiz Title",
          description: "Complete a short quiz covering functions.",
          dueDate: "2026-12-15T23:59",
          pointsPossible: 50,
        },
        {
          accessToken: "access-token",
          canvasUrl: "https://canvas.university.edu",
        },
      );
    });
  });

  it("allows cancelling out of the preview dialog without creating the assignment", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));
    await screen.findByLabelText("Assignment title");

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));
    await screen.findByRole("button", { name: "Confirm & Create" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedApprove).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      ),
    ).not.toBeInTheDocument();
  });

  it("returns to describe step from review through step navigation", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    await screen.findByLabelText("Assignment title");
    await user.click(screen.getByRole("button", { name: "Go to Describe Assignment" }));

    expect(screen.getByText("Describe Your Assignment")).toBeInTheDocument();
  });

  it("clears stale preview when review fields change before previewing again", async () => {
    const user = userEvent.setup();
    mockedPreview
      .mockResolvedValueOnce({
        summary: "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
        reversible: true,
        affectedResources: [{ type: "assignment", name: "Python Functions Quiz" }],
      })
      .mockResolvedValueOnce({
        summary: "Create assignment 'Edited Quiz Title' in CS 101: Introduction to Programming",
        reversible: true,
        affectedResources: [{ type: "assignment", name: "Edited Quiz Title" }],
      });

    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));
    const titleInput = await screen.findByLabelText("Assignment title");

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));
    await screen.findByText(
      "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.clear(titleInput);
    await user.type(titleInput, "Edited Quiz Title");
    expect(
      screen.queryByText(
        "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));
    expect(
      await screen.findByText(
        "Create assignment 'Edited Quiz Title' in CS 101: Introduction to Programming",
      ),
    ).toBeInTheDocument();
  });

  it("locks review fields while preview approval is loading", async () => {
    const user = userEvent.setup();
    const previewRequest = deferred<Awaited<ReturnType<typeof previewAssignmentDraft>>>();
    mockedPreview.mockReturnValueOnce(previewRequest.promise);

    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    const titleInput = await screen.findByLabelText("Assignment title");
    const descriptionInput = screen.getByLabelText("Assignment description");
    const dueDateInput = screen.getByLabelText("Due date");
    const pointsInput = screen.getByLabelText("Points possible");

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    expect(await screen.findByRole("button", { name: "Approving..." })).toBeDisabled();
    expect(titleInput).toBeDisabled();
    expect(descriptionInput).toBeDisabled();
    expect(dueDateInput).toBeDisabled();
    expect(pointsInput).toBeDisabled();

    previewRequest.resolve({
      summary: "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      reversible: true,
      affectedResources: [{ type: "assignment", name: "Python Functions Quiz" }],
    });

    expect(
      await screen.findByText(
        "Create assignment 'Python Functions Quiz' in CS 101: Introduction to Programming",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Shows an error when assignment generation fails.
  it("shows an error when assignment generation fails", async () => {
    const user = userEvent.setup();
    mockedGenerate.mockRejectedValueOnce(
      new Error("The assignment generator is temporarily unavailable. Please try again."),
    );

    renderPage();

    await screen.findByRole("option", {
      name: "CS 101: Introduction to Programming",
    });
    await user.selectOptions(screen.getByLabelText("Select Course"), "42");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    expect(
      await screen.findByText(/assignment generator is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Describe Your Assignment")).toBeInTheDocument();
  });

  it("saves a describe-step prompt as a typed draft and resumes to describe", async () => {
    const user = userEvent.setup();
    renderPage();

    const promptField = screen.getByLabelText("Assignment Prompt");
    // Suggested prompts can prefill this field; clear first so this assertion
    // covers the typed draft text only.
    await user.clear(promptField);
    await user.type(promptField, "Raw prompt before generation");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText(/Draft saved/i);
    const drafts = listTypedDrafts(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content).toEqual({ body: "Raw prompt before generation" });

    cleanup();
    renderPage({
      typedDraftId: drafts[0]!.id,
      aiAssignmentDraft: {
        courseId: 42,
        name: "",
        description: "",
        prompt: "Raw prompt before generation",
      },
    });

    expect(screen.getByText("Describe Your Assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignment Prompt")).toHaveValue(
      "Raw prompt before generation",
    );
    expect(screen.queryByLabelText("Assignment title")).not.toBeInTheDocument();
  });

  it("saves edited review fields and discards the typed draft after Canvas confirm", async () => {
    const user = userEvent.setup();
    const existing = saveTypedDraft(1, {
      kind: "assignment",
      content: { title: "Old Title", body: "Old body" },
    });

    renderPage({
      typedDraftId: existing.id,
      aiAssignmentDraft: {
        courseId: 42,
        name: "Old Title",
        description: "Old body",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 50,
      },
    });

    const titleInput = await screen.findByLabelText("Assignment title");
    await user.clear(titleInput);
    await user.type(titleInput, "Edited Saved Title");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.content.title).toBe("Edited Saved Title");
    // Regression (#6): due date and points possible were previously dropped
    // when saving a typed draft from the review step.
    expect(saved[0]?.content.dueDate).toBe("2026-12-15T23:59");
    expect(saved[0]?.content.pointsPossible).toBe(50);

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));
    await user.click(await screen.findByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalled();
    });
    expect(listTypedDrafts(1)).toHaveLength(0);
  });

  // Verifies: Regression (#6) — resuming a saved assignment draft restores
  // the due date instead of leaving it empty.
  it("restores due date and points possible when resuming a saved draft", async () => {
    const user = userEvent.setup();
    renderPage({
      typedDraftId: undefined,
      aiAssignmentDraft: {
        courseId: 42,
        name: "Python Functions Quiz",
        description: "Cover functions and parameters",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 75,
      },
    });

    await user.click(await screen.findByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const drafts = listTypedDrafts(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content.dueDate).toBe("2026-12-15T23:59");
    expect(drafts[0]?.content.pointsPossible).toBe(75);

    cleanup();
    renderPage({
      typedDraftId: drafts[0]!.id,
      aiAssignmentDraft: {
        courseId: 42,
        name: drafts[0]!.content.title ?? "",
        description: drafts[0]!.content.body ?? "",
        dueDate: drafts[0]!.content.dueDate,
        pointsPossible: drafts[0]!.content.pointsPossible,
      },
    });

    expect(await screen.findByLabelText("Due date")).toHaveValue("2026-12-15T23:59");
    expect(screen.getByLabelText("Points possible")).toHaveValue(75);
  });

  // Verifies: Regression (#15) — a chat handoff runs the same draft
  // generator the "+ Create Assignment" path uses, so the vague one-line
  // description the chat extracted gets written out before Review.
  it("expands the assistant's description through the draft generator", async () => {
    mockedGenerate.mockResolvedValue({
      name: "Ignored Title",
      description: "A full, written-out description about beef corndogs.",
      dueDate: "2099-01-01T00:00",
      pointsPossible: 999,
    });

    renderPage({
      aiAssignmentDraft: {
        courseId: 42,
        name: "Homework 3",
        description: "it is about beef corndogs",
        dueDate: "2026-08-04T23:59",
        pointsPossible: 120,
        prompt: "Homework 3. it is about beef corndogs",
      },
    });

    await waitFor(() => {
      expect(mockedGenerate).toHaveBeenCalledWith(
        42,
        "Homework 3. it is about beef corndogs",
        expect.anything(),
      );
    });

    const description = await screen.findByDisplayValue(
      "A full, written-out description about beef corndogs.",
    );
    expect(description).toBeInTheDocument();

    // Only the description is taken. Title, due date, and points were
    // explicitly stated by the instructor and must survive the generator's
    // own defaults.
    expect(screen.getByDisplayValue("Homework 3")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-08-04T23:59")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Ignored Title")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("999")).not.toBeInTheDocument();
  });

  // Verifies: a second handoff onto the already-mounted route is treated as
  // new work. React Router reuses the element when the path is unchanged, and
  // every seeded value here comes from a useState initialiser or a useRef
  // single-flight guard — none of which re-run on a state change. Without the
  // identity key the page would keep the first handoff's draft and skip
  // expansion entirely, showing one assignment's content under another's name.
  it("re-seeds and re-expands when a second handoff reuses the mounted route", async () => {
    const user = userEvent.setup();
    mockedGenerate
      .mockResolvedValueOnce({
        name: "Ignored",
        description: "Expanded description for the first handoff.",
        dueDate: "2099-01-01T00:00",
        pointsPossible: 999,
      })
      .mockResolvedValueOnce({
        name: "Ignored",
        description: "Expanded description for the second handoff.",
        dueDate: "2099-01-01T00:00",
        pointsPossible: 999,
      });

    const secondHandoff = {
      aiAssignmentDraft: {
        courseId: 42,
        name: "Homework 4",
        description: "it is about sorting",
        dueDate: "2026-09-09T23:59",
        pointsPossible: 60,
        prompt: "Homework 4. it is about sorting",
      },
    };

    // Lives outside <Routes> so it survives the navigation and can trigger a
    // create -> create transition without unmounting the page.
    function SecondHandoffButton() {
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() =>
            navigate("/instructor/assignments/create", { state: secondHandoff })
          }
        >
          send second handoff
        </button>
      );
    }

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/instructor/assignments/create",
            state: {
              aiAssignmentDraft: {
                courseId: 42,
                name: "Homework 3",
                description: "it is about beef corndogs",
                dueDate: "2026-08-04T23:59",
                pointsPossible: 120,
                prompt: "Homework 3. it is about beef corndogs",
              },
            },
          },
        ]}
      >
        <SecondHandoffButton />
        <Routes>
          <Route
            path="/instructor/assignments/create"
            element={<InstructorAssignmentCreateRoute />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByDisplayValue(
        "Expanded description for the first handoff.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "send second handoff" }),
    );

    // The generator runs again for the new prompt rather than being refused
    // by the first handoff's guard.
    await waitFor(() => {
      expect(mockedGenerate).toHaveBeenCalledWith(
        42,
        "Homework 4. it is about sorting",
        expect.anything(),
      );
    });
    expect(
      await screen.findByDisplayValue(
        "Expanded description for the second handoff.",
      ),
    ).toBeInTheDocument();

    // And the form shows the second assignment, not the first one's values.
    expect(screen.getByDisplayValue("Homework 4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-09-09T23:59")).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Homework 3")).not.toBeInTheDocument();
  });

  // Verifies: Regression (#15) — the LLM round-trip is visible rather than
  // flashing the chat's one-liner and swapping it under the instructor.
  it("shows a generating state while expanding the description", async () => {
    const pending = deferred<{
      name: string;
      description: string;
      dueDate: string;
      pointsPossible: number;
    }>();
    mockedGenerate.mockReturnValue(pending.promise);

    renderPage({
      aiAssignmentDraft: {
        courseId: 42,
        name: "Homework 3",
        description: "it is about beef corndogs",
        dueDate: "2026-08-04T23:59",
        pointsPossible: 120,
        prompt: "Homework 3. it is about beef corndogs",
      },
    });

    expect(
      await screen.findByText(/Writing a full description from your request/),
    ).toBeInTheDocument();

    pending.resolve({
      name: "Ignored",
      description: "Expanded description.",
      dueDate: "2099-01-01T00:00",
      pointsPossible: 999,
    });

    expect(
      await screen.findByDisplayValue("Expanded description."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Writing a full description from your request/),
    ).not.toBeInTheDocument();
  });

  // Verifies: Regression (#15) — a generator failure drops to Describe with
  // the prompt intact, rather than stranding the instructor on Review.
  it("falls back to the describe step when expansion fails", async () => {
    mockedGenerate.mockRejectedValue(new Error("Generator unavailable"));

    renderPage({
      aiAssignmentDraft: {
        courseId: 42,
        name: "Homework 3",
        description: "it is about beef corndogs",
        dueDate: "2026-08-04T23:59",
        pointsPossible: 120,
        prompt: "Homework 3. it is about beef corndogs",
      },
    });

    expect(await screen.findByText("Generator unavailable")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Homework 3. it is about beef corndogs"),
    ).toBeInTheDocument();
  });

  // Verifies: Regression (#15) — handoffs without a prompt (the per-course
  // "Create" button, and resumed typed drafts) must not trigger a generate
  // call, or resuming a saved draft would silently overwrite edits.
  it("does not auto-generate when the handoff carries no prompt", async () => {
    renderPage({
      aiAssignmentDraft: {
        courseId: 42,
        name: "Homework 3",
        description: "it is about beef corndogs",
        dueDate: "2026-08-04T23:59",
        pointsPossible: 120,
      },
    });

    expect(
      await screen.findByDisplayValue("it is about beef corndogs"),
    ).toBeInTheDocument();
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
  // Verifies: Regression (#15) — canvasUrl resolves from AuthContext /
  // InstitutionContext, so it is undefined on first render and populated a
  // tick later. That dep change re-runs the effect: the previous run's
  // cleanup cancels the in-flight call, and the single-flight ref blocks
  // the new run from starting another. If cancellation also gates the
  // "settled" flag, the spinner never clears and the description never
  // arrives — the backend answers in under a second, but the UI hangs.
  it("still settles when canvasUrl resolves mid-flight", async () => {
    canvasUrlHolder.current = undefined;
    const pending = deferred<{
      name: string;
      description: string;
      dueDate: string;
      pointsPossible: number;
    }>();
    mockedGenerate.mockReturnValue(pending.promise);

    // A fresh element each time so the rerender is not bailed out of.
    const makeTree = () => (
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/instructor/assignments/create",
            state: {
              aiAssignmentDraft: {
                courseId: 42,
                name: "Homework 3",
                description: "it is about beef corndogs",
                dueDate: "2026-08-04T23:59",
                pointsPossible: 120,
                prompt: "Homework 3. it is about beef corndogs",
              },
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/instructor/assignments/create"
            element={<InstructorAssignmentCreatePage />}
          />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(makeTree());

    expect(
      await screen.findByText(/Writing a full description from your request/),
    ).toBeInTheDocument();

    // Canvas URL resolves while the request is still in flight, re-running
    // the effect with changed deps.
    canvasUrlHolder.current = "https://canvas.university.edu";
    rerender(makeTree());

    pending.resolve({
      name: "Ignored",
      description: "Expanded after canvasUrl resolved.",
      dueDate: "2099-01-01T00:00",
      pointsPossible: 999,
    });

    expect(
      await screen.findByDisplayValue("Expanded after canvasUrl resolved."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Writing a full description from your request/),
    ).not.toBeInTheDocument();
  });
});
