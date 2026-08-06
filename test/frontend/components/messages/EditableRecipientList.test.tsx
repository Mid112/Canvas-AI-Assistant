import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditableRecipientList } from "@/components/messages/EditableRecipientList";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const recipients = [
  { id: "101", name: "Alex Student", email: "alex@example.edu" },
  { id: "102", name: "Blake Student", email: "blake@example.edu" },
];

describe("EditableRecipientList", () => {
  // #689 — Add missing frontend tests
  // Verifies: Empty list shows the empty-state message.
  it("shows an empty-state message when there are no recipients", () => {
    renderWithRouter(
      <EditableRecipientList
        recipients={[]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "No recipients selected. Add students before sending this message.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Recipients render with checked state and contact details.
  it("renders recipient names, emails, and selection state", () => {
    renderWithRouter(
      <EditableRecipientList
        recipients={recipients}
        selectedIds={new Set(["101"])}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Alex Student")).toBeInTheDocument();
    expect(screen.getByText("alex@example.edu")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Alex Student/i })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Blake Student/i }),
    ).not.toBeChecked();
  });

  // Verifies: Toggle and remove callbacks fire.
  it("calls onToggle and onRemove when interacting with a recipient", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onRemove = vi.fn();

    renderWithRouter(
      <EditableRecipientList
        recipients={recipients}
        selectedIds={new Set(["101"])}
        onToggle={onToggle}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Blake Student/i }));
    expect(onToggle).toHaveBeenCalledWith("102");

    await user.click(screen.getByRole("button", { name: "Remove Alex Student" }));
    expect(onRemove).toHaveBeenCalledWith("101");
  });
});
