import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  });

  it("renders empty state when no recipients", () => {
    render(<RecipientSummary recipients={[]} />);

    expect(
      screen.getByText(/No recipients selected/i),
    ).toBeInTheDocument();
    expect(screen.getByText("0 students selected")).toBeInTheDocument();
  });
});
