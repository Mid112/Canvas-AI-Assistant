import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecipientSummary } from "@/components/messages/RecipientSummary";

describe("RecipientSummary", () => {
  it("renders recipient list and selected count", () => {
    render(
      <RecipientSummary
        recipients={[
          { id: "1", name: "John Smith", email: "john@university.edu" },
          { id: "2", name: "Sarah Lee", email: "sarah@university.edu" },
        ]}
      />,
    );

    expect(screen.getByText("Select Students")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("2 students selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /John Smith/i })).toBeChecked();
  });

  it("toggles a single recipient", async () => {
    const user = userEvent.setup();
    const onToggleRecipient = vi.fn();

    render(
      <RecipientSummary
        recipients={[
          { id: "1", name: "John Smith", email: "john@university.edu" },
          { id: "2", name: "Sarah Lee", email: "sarah@university.edu" },
        ]}
        selectedRecipientIds={["1"]}
        onToggleRecipient={onToggleRecipient}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Sarah Lee/i }));

    expect(screen.getByText("1 student selected")).toBeInTheDocument();
    expect(onToggleRecipient).toHaveBeenCalledWith("2");
  });

  it("renders empty state when no recipients", () => {
    render(<RecipientSummary recipients={[]} />);

    expect(
      screen.getByText(/No recipients selected/i),
    ).toBeInTheDocument();
    expect(screen.getByText("0 students selected")).toBeInTheDocument();
  });
});
