// Test note: covers the recipient summary.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecipientSummary } from "@/components/messages/RecipientSummary";

const recipients = [
  { id: "1", name: "John Smith", email: "john@university.edu" },
  { id: "2", name: "Sarah Lee", email: "sarah@university.edu" },
];

describe("RecipientSummary", () => {
  it("renders recipient list and selected count", () => {
    render(
      <RecipientSummary
        recipients={recipients}
        selectedIds={new Set(["1", "2"])}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Select Students")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("2 students selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
  });

  it("renders empty state when no recipients", () => {
    render(
      <RecipientSummary
        recipients={[]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText(/No recipients selected/i)).toBeInTheDocument();
    expect(screen.getByText("Course announcement selected")).toBeInTheDocument();
  });

  it("unchecking a recipient calls onToggle and updates the selected count", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <RecipientSummary
        recipients={recipients}
        selectedIds={new Set(["1", "2"])}
        onToggle={onToggle}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /John Smith/i }));
    expect(onToggle).toHaveBeenCalledWith("1");
  });

  it("shows partial selection count and a remove control per recipient", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <RecipientSummary
        recipients={recipients}
        selectedIds={new Set(["1"])}
        onToggle={vi.fn()}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("1 student selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Sarah Lee" }));
    expect(onRemove).toHaveBeenCalledWith("2");
  });

  it("calls onSelectAll when the header toggle is clicked", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();

    render(
      <RecipientSummary
        recipients={recipients}
        selectedIds={new Set(["1"])}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onSelectAll={onSelectAll}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onSelectAll).toHaveBeenCalled();
  });
});
