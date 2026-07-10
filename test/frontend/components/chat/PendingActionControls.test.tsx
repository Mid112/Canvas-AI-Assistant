import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingActionControls } from "@/components/chat/PendingActionControls";

describe("PendingActionControls", () => {
  it("shows confirm, edit, and cancel actions for pending proposals", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onModify = vi.fn();

    render(
      <PendingActionControls
        error="Unable to confirm action."
        onConfirm={onConfirm}
        onCancel={onCancel}
        onModify={onModify}
      />,
    );

    expect(
      screen.getByText("Approve this proposed action?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to confirm action.",
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.click(screen.getByRole("button", { name: "Edit before sending" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onModify).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
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
});
