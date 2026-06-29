import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorAssignmentUpdatePage } from "@/pages/Instructor/InstructorAssignmentUpdatePage";
import {
  fetchAssignment,
  updateAssignment,
} from "@/services/assignments";
import { fetchCourses } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status = 500;
  },
  fetchCourses: vi.fn(),
}));

vi.mock("@/services/assignments", () => ({
  AssignmentApiError: class AssignmentApiError extends Error {
    status = 500;
  },
  fetchAssignment: vi.fn(),
  updateAssignment: vi.fn(),
}));

const mockedFetchAssignment = vi.mocked(fetchAssignment);
const mockedUpdateAssignment = vi.mocked(updateAssignment);
const mockedFetchCourses = vi.mocked(fetchCourses);

const CANVAS_URL = "https://canvas.ubc.ca";

const authWithCanvas = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor",
    is_active: true,
    has_canvas_token: true,
  },
  accessToken: "token",
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const assignment = {
  id: 10,
  name: "Lab 1",
  description: "Complete the lab.",
  due_at: "2026-12-15T12:00:00.000Z",
  points_possible: 50,
  course_id: 3,
};

function renderPage() {
  return renderWithInstitution(
    <Routes>
      <Route
        path="/instructor/courses/:localCourseId/assignments/:assignmentId/edit"
        element={<InstructorAssignmentUpdatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: ["/instructor/courses/3/assignments/10/edit"],
      },
    },
  );
}

describe("InstructorAssignmentUpdatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(authWithCanvas);
    mockedFetchCourses.mockResolvedValue([
      {
        canvas_id: 99,
        local_id: 3,
        name: "Database Systems",
        course_code: "CS 250",
        workflow_state: "available",
        total_students: 52,
      },
    ]);
    mockedFetchAssignment.mockResolvedValue(assignment);
    mockedUpdateAssignment.mockResolvedValue({
      ...assignment,
      name: "Lab 1 Revised",
    });
  });

  it("loads assignment details and shows the edit form", async () => {
    renderPage();

    expect(screen.getByText("Loading assignment")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Assignment title")).toHaveValue("Lab 1");
    });

    expect(mockedFetchAssignment).toHaveBeenCalledWith(
      99,
      10,
      "token",
      CANVAS_URL,
    );
  });

  it("shows preview before confirming updates", async () => {
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText("Assignment title")).toHaveValue("Lab 1");
    });

    await user.clear(screen.getByLabelText("Assignment title"));
    await user.type(screen.getByLabelText("Assignment title"), "Lab 1 Revised");
    await user.click(screen.getByRole("button", { name: "Preview Changes" }));

    expect(await screen.findByText("Preview Changes")).toBeInTheDocument();
    expect(screen.getByText("Lab 1 Revised")).toBeInTheDocument();
    expect(mockedUpdateAssignment).not.toHaveBeenCalled();
  });

  it("prompts to connect Canvas when no token is linked", async () => {
    mockUseAuth.mockReturnValue({
      ...authWithCanvas,
      user: {
        ...authWithCanvas.user,
        has_canvas_token: false,
      },
    });

    renderPage();

    expect(
      await screen.findByText("Connect Canvas to continue"),
    ).toBeInTheDocument();
    expect(mockedFetchAssignment).not.toHaveBeenCalled();
  });
});
