import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignmentReviewApproveStep } from "@/pages/Instructor/InstructorAssignmentCreate/AssignmentReviewApproveStep";

const draft = {
  name: "Python Functions Quiz",
  description: "Complete a short quiz covering functions.",
  dueDate: "2026-12-15T23:59",
  pointsPossible: 50,
};

describe("AssignmentReviewApproveStep", () => {
  it("renders title, description, and due date fields", () => {
    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Assignment title")).toHaveValue(
      "Python Functions Quiz",
    );
    expect(screen.getByLabelText("Assignment description")).toHaveValue(
      "Complete a short quiz covering functions.",
    );
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-12-15T23:59");
  });

  it("validates empty title on approve", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Assignment title"));
    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    expect(await screen.findByText("Title cannot be empty")).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  });
});
