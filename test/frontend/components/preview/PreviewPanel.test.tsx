import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";

describe("PreviewPanel", () => {
  // Verifies: Renders workflow preview sections from mock data.
  it("renders workflow preview sections from mock data", () => {
    render(
      <PreviewPanel
        preview={mockStudentReminderPreview}
        onReject={vi.fn()}
        onModify={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Workflow Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Original Request")).toBeInTheDocument();
    expect(screen.getByText("AI Explanation")).toBeInTheDocument();
    expect(screen.getByText("Generated Canvas Query")).toBeInTheDocument();
    expect(screen.getByText("Affected Entities")).toBeInTheDocument();
    expect(screen.getByText("Review Required")).toBeInTheDocument();
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    expect(screen.getByText("GET /assignments/submissions")).toBeInTheDocument();
    expect(screen.getByText("POST /conversations")).toBeInTheDocument();
  });

  // Verifies: Calls action handlers from the preview actions.
  it("calls action handlers from the preview actions", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onModify = vi.fn();
    const onConfirm = vi.fn();

    render(
      <PreviewPanel
        preview={mockStudentReminderPreview}
        onReject={onReject}
        onModify={onModify}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Reject/ }));
    await user.click(screen.getByRole("button", { name: /Modify Request/ }));
    await user.click(screen.getByRole("button", { name: /Approve & Execute/ }));

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onModify).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // Verifies: Shows the structured proposed plan instead of raw request text when available.
  it("shows the structured proposed plan instead of raw request text when available", () => {
    render(
      <PreviewPanel
        preview={{
          ...mockStudentReminderPreview,
          proposedPlan: [
            { field: "title", label: "Title", value: "Midterm Exam" },
            { field: "due_date", label: "Due Date", value: "2026-08-01" },
          ],
        }}
        onReject={vi.fn()}
        onModify={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Proposed Plan")).toBeInTheDocument();
    expect(screen.queryByText("Original Request")).not.toBeInTheDocument();
    expect(screen.getByText("Midterm Exam")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
  });
});
