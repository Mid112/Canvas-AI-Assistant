import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignmentUpdateForm } from "@/pages/Instructor/InstructorAssignmentUpdate/AssignmentUpdateForm";
import { assignmentToFormValues } from "@/lib/assignment-utils";
import type { Assignment } from "@/types/assignment";

const assignment: Assignment = {
  id: 10,
  name: "Lab 1",
  description: "Complete the lab.",
  due_at: "2026-12-15T12:00:00.000Z",
  points_possible: 50,
  course_id: 3,
  published: true,
};

describe("AssignmentUpdateForm", () => {
  // Verifies: Renders editable fields without exposing internal Canvas IDs.
  it("renders assignment fields without an internal id", () => {
    render(
      <AssignmentUpdateForm
        assignment={assignment}
        defaultValues={assignmentToFormValues(assignment)}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Assignment ID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Assignment title")).toHaveValue("Lab 1");
    expect(screen.getByLabelText("Assignment description")).toHaveValue(
      "Complete the lab.",
    );
    expect(
      screen.getByRole("button", { name: "Preview Changes" }),
    ).toBeInTheDocument();
  });

  // Verifies: Shows inline validation when title is empty.
  it("shows inline validation when title is empty", async () => {
    const user = userEvent.setup();

    render(
      <AssignmentUpdateForm
        assignment={assignment}
        defaultValues={assignmentToFormValues(assignment)}
        onPreview={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Assignment title"));
    await user.click(screen.getByRole("button", { name: "Preview Changes" }));

    expect(await screen.findByText(/Title cannot be empty/)).toBeInTheDocument();
  });
});
