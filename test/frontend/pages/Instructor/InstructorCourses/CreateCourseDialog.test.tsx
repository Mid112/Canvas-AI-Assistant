// Test note: covers the create course dialog.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateCourseDialog } from "@/pages/Instructor/InstructorCourses/CreateCourseDialog";
import { CanvasApiError } from "@/services/canvas";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const CONNECTION_URL = "http://localhost:3000";

const mockUseCanvasConnectionUrl = vi.fn(() => CONNECTION_URL);
const mockUseAuth = vi.fn();
const mockCreateCourse = vi.fn();

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => mockUseCanvasConnectionUrl(),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/services/canvas", async () => {
  const actual = await vi.importActual<typeof import("@/services/canvas")>(
    "@/services/canvas",
  );
  return {
    ...actual,
    createCourse: (...args: unknown[]) => mockCreateCourse(...args),
  };
});

beforeEach(() => {
  mockCreateCourse.mockReset();
  mockUseCanvasConnectionUrl.mockReturnValue(CONNECTION_URL);
  mockUseAuth.mockReturnValue({
    accessToken: "tok",
    user: {
      id: 42,
      has_canvas_token: true,
      canvas_connections: [
        { id: 1, canvas_url: CONNECTION_URL, created_at: "2026-07-30T00:00:00.000Z" },
      ],
    },
  });
});

describe("CreateCourseDialog", () => {
  // Verifies: Newly connected accounts create their first course with the saved Canvas URL.
  it("creates the first course using the saved Canvas connection URL", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockCreateCourse.mockResolvedValue({
      canvas_id: 9,
      local_id: 1,
      name: "Capstone Project",
      course_code: "COSC 499",
      workflow_state: "unpublished",
      total_students: null,
      term_name: null,
    });

    renderWithInstitution(
      <CreateCourseDialog open onOpenChange={() => undefined} onCreated={onCreated} />,
    );

    await user.type(screen.getByLabelText("Course name"), "Capstone Project");
    await user.type(screen.getByLabelText("Course code (optional)"), "COSC 499");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => {
      expect(mockCreateCourse).toHaveBeenCalledWith(
        {
          name: "Capstone Project",
          course_code: "COSC 499",
          publish: false,
        },
        "tok",
        CONNECTION_URL,
      );
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/PATCH to \/api\/v1/)).not.toBeInTheDocument();
  });

  // Verifies: Invalid course codes are blocked with concise inline guidance.
  it("shows inline help and does not submit invalid course codes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(
      <CreateCourseDialog open onOpenChange={() => undefined} />,
    );

    const courseCodeInput = screen.getByLabelText("Course code (optional)");
    await user.type(screen.getByLabelText("Course name"), "Capstone Project");
    await user.type(courseCodeInput, "COSC@499");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(courseCodeInput).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Use a subject and number like COSC 499 or COSC499."),
    ).toBeInTheDocument();
    expect(mockCreateCourse).not.toHaveBeenCalled();
  });

  // Verifies: Missing Canvas token errors show reconnect guidance instead of raw API text.
  it("shows a reconnect path when Canvas token is missing for the institution URL", async () => {
    const user = userEvent.setup();
    mockCreateCourse.mockRejectedValue(
      new CanvasApiError(
        "No Canvas token for https://canvas.ubc.ca. Reconnect Canvas in Settings, then try again.",
        403,
      ),
    );

    renderWithInstitution(
      <CreateCourseDialog open onOpenChange={() => undefined} />,
    );

    await user.type(screen.getByLabelText("Course name"), "Capstone Project");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(
      await screen.findByText(
        "Canvas is not connected for this institution. Reconnect Canvas in Settings, then try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reconnect Canvas" }),
    ).toHaveAttribute("href", "/instructor/settings?tab=canvas");
    expect(screen.queryByText(/PATCH to \/api\/v1/)).not.toBeInTheDocument();
  });

  // Verifies: Blocks create and prompts reconnect when no Canvas connection URL is resolved.
  it("prompts reconnect when no Canvas connection URL is available", async () => {
    const user = userEvent.setup();
    mockUseCanvasConnectionUrl.mockReturnValue(undefined);

    renderWithInstitution(
      <CreateCourseDialog open onOpenChange={() => undefined} />,
    );

    await user.type(screen.getByLabelText("Course name"), "Capstone Project");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(
      await screen.findByText(
        "Canvas is not connected for this institution. Reconnect Canvas in Settings, then try again.",
      ),
    ).toBeInTheDocument();
    expect(mockCreateCourse).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Reconnect Canvas" }),
    ).toBeInTheDocument();
  });
});
