import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";

describe("PreviewPanel", () => {
  // Verifies: Renders workflow preview sections from mock data.
  it("renders workflow preview with technical details collapsed", async () => {
    const user = userEvent.setup();
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
    const details = screen.getByRole("button", { name: "Technical details" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Affected Entities")).toBeInTheDocument();
    expect(screen.getByText("Review Required")).toBeInTheDocument();
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();

    await user.click(details);

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

  it("submits editable fields to regenerate the preview", async () => {
    const user = userEvent.setup();
    const onSaveEdits = vi.fn();
    render(
      <PreviewPanel
        preview={{
          ...mockStudentReminderPreview,
          actionName: "create_assignment",
          proposedPlan: [
            {
              field: "title",
              label: "Title",
              value: "Midterm",
              rawValue: "Midterm",
              editable: true,
            },
            {
              field: "points_possible",
              label: "Points Possible",
              value: "50",
              rawValue: 50,
              editable: true,
            },
          ],
        }}
        onSaveEdits={onSaveEdits}
        onReject={vi.fn()}
        onModify={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Final Exam");
    await user.click(
      screen.getByRole("button", { name: "Save & regenerate preview" }),
    );

    expect(onSaveEdits).toHaveBeenCalledWith({
      title: "Final Exam",
      points_possible: 50,
    });
  });

  it("shows save edit errors in the editable review form", () => {
    render(
      <PreviewPanel
        preview={{
          ...mockStudentReminderPreview,
          actionName: "create_assignment",
          proposedPlan: [
            {
              field: "title",
              label: "Title",
              value: "Midterm",
              rawValue: "Midterm",
              editable: true,
            },
          ],
        }}
        saveEditsError="Due date must be in the future."
        onSaveEdits={vi.fn()}
        onReject={vi.fn()}
        onModify={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Due date must be in the future.",
    );
  });
});
