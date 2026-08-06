import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignmentUpdatePreview } from "@/pages/Instructor/InstructorAssignmentUpdate/AssignmentUpdatePreview";
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

describe("AssignmentUpdatePreview", () => {
  // Verifies: Shows original and updated values side by side.
  it("shows original and updated values side by side", () => {
    const proposedValues = {
      ...assignmentToFormValues(assignment),
      name: "Lab 1 Revised",
    };

    render(
      <AssignmentUpdatePreview
        assignment={assignment}
        proposedValues={proposedValues}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Preview Changes")).toBeInTheDocument();
    expect(screen.getAllByText("Lab 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Lab 1 Revised")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Changes" }),
    ).toBeEnabled();
  });

  // Verifies: Returns to edit mode when cancel is clicked.
  it("returns to edit mode when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const proposedValues = {
      ...assignmentToFormValues(assignment),
      name: "Lab 1 Revised",
    };

    render(
      <AssignmentUpdatePreview
        assignment={assignment}
        proposedValues={proposedValues}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel Changes" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
