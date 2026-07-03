import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";

describe("PreviewPanel", () => {
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
});
