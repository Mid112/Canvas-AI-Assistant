import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "@/components/messages/ConfirmationDialog";

const recipients = [
  { id: "1", name: "John Smith", email: "john@university.edu" },
  { id: "2", name: "Sarah Lee", email: "sarah@university.edu" },
  { id: "3", name: "Alex Kim", email: "alex@university.edu" },
];

describe("ConfirmationDialog", () => {
  it("renders the full subject and body alongside the recipient count", () => {
    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set(["1", "2", "3"])}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Reminder: assignment due Friday"
        body="Please submit your work before the deadline."
        isSending={false}
        deliveryMode="private_message"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Send Message?")).toBeInTheDocument();
    expect(screen.getByText(/3 students/i)).toBeInTheDocument();
    expect(screen.getByText("Reminder: assignment due Friday")).toBeInTheDocument();
    expect(
      screen.getByText("Please submit your work before the deadline."),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when Confirm Send is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set(["1", "2", "3"])}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Subject"
        body="Body"
        isSending={false}
        deliveryMode="private_message"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm Send" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("allows confirm with no selected recipients for course announcements", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set()}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Subject"
        body="Body"
        isSending={false}
        deliveryMode="announcement"
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByText(/whole course as an announcement/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Send" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps a private handoff private when all recipients are cleared", () => {
    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set()}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Subject"
        body="Body"
        isSending={false}
        deliveryMode="private_message"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("PRIVATE MESSAGE")).toBeInTheDocument();
    expect(screen.queryByText(/whole course as an announcement/i)).not.toBeInTheDocument();
  });

  it("lets the user deselect and remove a recipient from within the dialog", async () => {
    const user = userEvent.setup();
    const onToggleRecipient = vi.fn();
    const onRemoveRecipient = vi.fn();

    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set(["1", "2", "3"])}
        onToggleRecipient={onToggleRecipient}
        onRemoveRecipient={onRemoveRecipient}
        subject="Subject"
        body="Body"
        isSending={false}
        deliveryMode="private_message"
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Sarah Lee/i }));
    expect(onToggleRecipient).toHaveBeenCalledWith("2");

    await user.click(screen.getByRole("button", { name: "Remove Alex Kim" }));
    expect(onRemoveRecipient).toHaveBeenCalledWith("3");
  });
});
