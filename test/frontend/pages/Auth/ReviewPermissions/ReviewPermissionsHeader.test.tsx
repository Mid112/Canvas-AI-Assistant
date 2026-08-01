import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewPermissionsHeader } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsHeader";

describe("ReviewPermissionsHeader", () => {
  // Verifies: Renders the review permissions heading.
  it("renders the review permissions heading", () => {
    render(<ReviewPermissionsHeader />);

    expect(
      screen.getByRole("heading", { name: "Review Canvas Permissions" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the description text.
  it("renders the description text", () => {
    render(<ReviewPermissionsHeader />);

    expect(
      screen.getByText(
        "Here's what the AI assistant can access in Canvas and why, so you can confirm it before continuing.",
      ),
    ).toBeInTheDocument();
  });
});
