import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuizPreviewDialog } from "@/pages/Instructor/InstructorQuizCreate/QuizPreviewDialog";

const preview = {
  summary: "Create quiz 'Recursion Quiz' with 2 questions.",
  reversible: true,
  riskLevel: "medium" as const,
  affectedResources: [
    { type: "course", name: "CPSC 310" },
    { type: "quiz", name: "Recursion Quiz" },
  ],
  metadata: { title: "Recursion Quiz", question_count: 2 },
};

describe("QuizPreviewDialog", () => {
  it("shows a simplified preview before execution", () => {
    const onConfirm = vi.fn();
    render(
      <QuizPreviewDialog
        open
        onOpenChange={vi.fn()}
        preview={preview}
        isCreating={false}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(preview.summary)).toBeInTheDocument();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByText(/Reversible/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps technical details collapsed until requested", async () => {
    const user = userEvent.setup();
    render(
      <QuizPreviewDialog
        open
        onOpenChange={vi.fn()}
        preview={preview}
        isCreating={false}
        onConfirm={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Technical details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/risk_level/)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/risk_level/)).toBeInTheDocument();
    expect(
      screen.getByText(/POST \/api\/v1\/canvas\/courses/),
    ).toBeInTheDocument();
  });

  it("executes only after explicit confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <QuizPreviewDialog
        open
        onOpenChange={vi.fn()}
        preview={preview}
        isCreating={false}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm & Create" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
