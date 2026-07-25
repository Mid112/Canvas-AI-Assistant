import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingActionControls } from "@/components/chat/PendingActionControls";

describe("PendingActionControls", () => {
  it("shows an Actions section with confirm, edit, and cancel for pending proposals", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onModify = vi.fn();

    render(
      <PendingActionControls
        onConfirm={onConfirm}
        onCancel={onCancel}
        onModify={onModify}
      />,
    );

    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(
      screen.getByText("Approve this proposed action?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.click(screen.getByRole("button", { name: "Edit before sending" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onModify).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("minimizes actions for read-only previews", () => {
    render(
      <PendingActionControls
        risk={{
          risk_level: "low",
          classification: "read_only",
          requires_confirmation: false,
          confirmation_requirement: {
            type: "none",
            label: "No confirmation needed",
            description: "Read-only actions run immediately and do not change Canvas.",
          },
          destructive: false,
          reversible: true,
          undoable: false,
          can_undo: false,
          reversibility: "No Canvas changes will be made.",
          warnings: [],
          technical_details: {},
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Read-only action. No confirmation required."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("requires typed confirmation for high-risk proposals", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <PendingActionControls
        risk={{
          risk_level: "high",
          classification: "irreversible",
          requires_confirmation: true,
          confirmation_requirement: {
            type: "strong",
            label: "Strong confirmation",
            description: "Type CONFIRM before executing this high-risk action.",
            confirmation_phrase: "CONFIRM",
          },
          destructive: true,
          reversible: false,
          undoable: false,
          can_undo: false,
          reversibility: "This action cannot be undone once submitted.",
          warnings: [],
          technical_details: {},
        }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type CONFIRM to confirm"), "CONFIRM");
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // Verifies: Shows status text after the proposal is resolved.
  it("shows status text after the proposal is resolved", () => {
    const { rerender } = render(
      <PendingActionControls
        status="confirmed"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("This action was confirmed.")).toBeInTheDocument();

    rerender(
      <PendingActionControls
        status="superseded"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("This proposal was replaced by a newer request."),
    ).toBeInTheDocument();

    rerender(
      <PendingActionControls
        status="cancelled"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("This action was cancelled.")).toBeInTheDocument();
  });

  it("shows pause and rename for pending proposals", async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onRename = vi.fn();

    render(
      <PendingActionControls
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onPause={onPause}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Rename workflow" }));
    await user.type(screen.getByLabelText("Workflow name"), "Quiz draft");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(onRename).toHaveBeenCalledWith("Quiz draft");
  });

  it("shows resume controls for paused proposals without cancel", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onCancel = vi.fn();

    render(
      <PendingActionControls
        status="paused"
        displayName="Quiz draft"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        onResume={onResume}
      />,
    );

    expect(screen.getByText(/“Quiz draft” is paused/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
