import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorAssignmentCreatePage } from "@/pages/Instructor/InstructorAssignmentCreatePage";
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

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => "https://canvas.university.edu",
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

function renderPage() {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/assignments/create"
        element={<InstructorAssignmentCreatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: ["/instructor/assignments/create"],
      },
    },
  );
}

describe("InstructorAssignmentCreatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("returns to describe step from review", async () => {
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
    await user.click(screen.getByRole("button", { name: "Back to Describe" }));

    expect(screen.getByText("Describe Your Assignment")).toBeInTheDocument();
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
});
