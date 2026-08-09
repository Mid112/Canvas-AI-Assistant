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
        onConfirm={onConfirm}
      />,
    );

    // "announcement" now sits in its own <strong> so it can be emphasised,
    // which splits the sentence across nodes — assert against the emphasised
    // word and the sentence that carries it.
    const mode = screen.getByText("announcement");
    expect(mode.parentElement?.textContent).toMatch(
      /whole course as an\s*announcement/i,
    );
    await user.click(screen.getByRole("button", { name: "Confirm Send" }));
    expect(onConfirm).toHaveBeenCalledOnce();
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
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Sarah Lee/i }));
    expect(onToggleRecipient).toHaveBeenCalledWith("2");

    await user.click(screen.getByRole("button", { name: "Remove Alex Kim" }));
    expect(onRemoveRecipient).toHaveBeenCalledWith("3");
  });

  // Verifies: a sent Canvas message cannot be un-sent (send_message is
  // classified irreversible in the backend), so the confirm dialog says so
  // up front rather than only in the body copy.
  it("shows High risk and Irreversible beside the title", () => {
    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set(["1"])}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Subject"
        body="Body"
        isSending={false}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("High risk")).toBeInTheDocument();
    const irreversible = screen.getByText("Irreversible");
    expect(irreversible).toBeInTheDocument();
    expect(irreversible.className).toContain("red");
  });

  // Verifies: which of the two sends this is has to survive skimming. The
  // announcement/private distinction used to sit at body-copy weight on a
  // dialog whose action cannot be undone.
  it("emphasises ANNOUNCEMENT when no recipients are selected", () => {
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
        onConfirm={vi.fn()}
      />,
    );

    const mode = screen.getByText("announcement");
    expect(mode.tagName).toBe("STRONG");
    expect(mode.className).toContain("uppercase");
    expect(mode.className).toContain("font-bold");
    expect(mode.className).toContain("text-base");
  });

  it("emphasises PRIVATE MESSAGE when recipients are selected", () => {
    render(
      <ConfirmationDialog
        open
        onOpenChange={vi.fn()}
        recipients={recipients}
        selectedRecipientIds={new Set(["1"])}
        onToggleRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
        subject="Subject"
        body="Body"
        isSending={false}
        onConfirm={vi.fn()}
      />,
    );

    const mode = screen.getByText("private message");
    expect(mode.tagName).toBe("STRONG");
    expect(mode.className).toContain("uppercase");
  });
});
