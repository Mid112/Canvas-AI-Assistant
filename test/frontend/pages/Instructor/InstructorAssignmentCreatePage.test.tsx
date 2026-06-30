import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorAssignmentCreatePage } from "@/pages/Instructor/InstructorAssignmentCreatePage";
import {
  approveAssignmentDraft,
  generateAssignmentDraft,
} from "@/services/assignmentCreator";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/assignmentCreator", () => ({
  AssignmentCreatorApiError: class AssignmentCreatorApiError extends Error {
    name = "AssignmentCreatorApiError";
  },
  generateAssignmentDraft: vi.fn(),
  approveAssignmentDraft: vi.fn(),
}));

const mockedGenerate = vi.mocked(generateAssignmentDraft);
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
    mockedApprove.mockResolvedValue();
  });

  it("walks through describe, review, and approve steps", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("heading", { name: "AI Assignment Creator" })).toBeInTheDocument();
    expect(screen.getByText("Describe Assignment")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Select Course"), "1");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    await waitFor(() => {
      expect(mockedGenerate).toHaveBeenCalledWith(
        "Create a quiz on Python functions and parameters for beginners.",
      );
    });

    expect(await screen.findByLabelText("Assignment title")).toHaveValue(
      "Python Functions Quiz",
    );

    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith({
        courseId: "1",
        name: "Python Functions Quiz",
        description: "Complete a short quiz covering functions.",
        dueDate: "2026-12-15T23:59",
      });
    });

    expect(await screen.findByText("Assignment Approved")).toBeInTheDocument();
  });

  it("passes instructor edits to approveAssignmentDraft", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Select Course"), "1");
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
      expect(mockedApprove).toHaveBeenCalledWith({
        courseId: "1",
        name: "Edited Quiz Title",
        description: "Complete a short quiz covering functions.",
        dueDate: "2026-12-15T23:59",
      });
    });
  });

  it("returns to describe step from review", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText("Select Course"), "1");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );
    await user.click(screen.getByRole("button", { name: "Generate Assignment" }));

    await screen.findByLabelText("Assignment title");
    await user.click(screen.getByRole("button", { name: "Back to Describe" }));

    expect(screen.getByText("Describe Your Assignment")).toBeInTheDocument();
  });

  it("shows an error when assignment generation fails", async () => {
    const user = userEvent.setup();
    mockedGenerate.mockRejectedValueOnce(
      new Error("The assignment generator is temporarily unavailable. Please try again."),
    );

    renderPage();

    await user.selectOptions(screen.getByLabelText("Select Course"), "1");
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
