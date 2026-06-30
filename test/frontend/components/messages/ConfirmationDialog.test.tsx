import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "@/components/messages/ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it("calls onConfirm when Confirm Send is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipientCount={3}
        isSending={false}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Send Message?")).toBeInTheDocument();
    expect(screen.getByText(/3 students/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm Send" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables confirm when there are no recipients", () => {
    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipientCount={0}
        isSending={false}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm Send" })).toBeDisabled();
  });
});
