import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssignmentPreviewDialog } from "@/pages/Instructor/InstructorAssignmentCreate/AssignmentPreviewDialog";
import type { AssignmentPreviewSummary } from "@/types/assignmentCreate";

const preview: AssignmentPreviewSummary = {
  summary: "Create 'Lab 1' in COSC 499.",
  reversible: true,
  affectedResources: [{ type: "course", name: "COSC 499" }],
  title: "Lab 1",
  dueDate: "August 15, 2026 at 11:59 PM",
  pointsPossible: "30 points",
};

function renderDialog(overrides: Partial<AssignmentPreviewSummary> = {}) {
  return render(
    <AssignmentPreviewDialog
      open
      onOpenChange={vi.fn()}
      preview={{ ...preview, ...overrides }}
      isCreating={false}
      onConfirm={vi.fn()}
    />,
  );
}

describe("AssignmentPreviewDialog", () => {
  // Verifies: reversibility is readable at a glance before an instructor
  // commits a Canvas write. It used to be a grey footnote below the affected
  // resources, in the dimmest style on the dialog.
  it("shows a Reversible badge beside the title", () => {
    renderDialog({ reversible: true });

    expect(screen.getByText("Create this assignment?")).toBeInTheDocument();
    const badge = screen.getByText("Reversible");
    expect(badge).toBeInTheDocument();
    // Emerald is the app's "safe / undoable" hue, matching ReversibilityStatus
    // on the dry-run page. Amber there means partially reversible.
    expect(badge.className).toContain("emerald");
  });

  it("shows Irreversible in red when the action cannot be undone", () => {
    renderDialog({ reversible: false });

    const badge = screen.getByText("Irreversible");
    expect(badge.className).toContain("red");
    expect(badge.className).not.toContain("emerald");
  });

  // Verifies: the badge is added, not substituted. The sentence explains what
  // reversible means; the badge only makes the state glanceable.
  it("keeps the explanatory sentence alongside the badge", () => {
    renderDialog({ reversible: true });

    expect(
      screen.getByText("This can be edited or removed in Canvas afterward."),
    ).toBeInTheDocument();
  });
});
