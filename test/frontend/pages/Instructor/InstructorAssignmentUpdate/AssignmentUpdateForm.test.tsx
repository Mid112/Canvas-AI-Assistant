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
};

describe("AssignmentUpdateForm", () => {
  it("renders assignment fields and read-only id", () => {
    render(
      <AssignmentUpdateForm
        assignment={assignment}
        defaultValues={assignmentToFormValues(assignment)}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Assignment ID")).toHaveValue("10");
    expect(screen.getByLabelText("Assignment title")).toHaveValue("Lab 1");
    expect(screen.getByLabelText("Assignment description")).toHaveValue(
      "Complete the lab.",
    );
    expect(
      screen.getByRole("button", { name: "Preview Changes" }),
    ).toBeInTheDocument();
  });

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

    expect(await screen.findByText("Title cannot be empty")).toBeInTheDocument();
  });
});
