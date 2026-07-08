import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewPermissionsHeader } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsHeader";

describe("ReviewPermissionsHeader", () => {
  // Verifies: Renders the review permissions heading.
  it("renders the review permissions heading", () => {
    render(<ReviewPermissionsHeader />);

    expect(
      screen.getByRole("heading", { name: "Review Permissions" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the description text.
  it("renders the description text", () => {
    render(<ReviewPermissionsHeader />);

    expect(
      screen.getByText(
        "Review what the AI assistant can and cannot do in Canvas",
      ),
    ).toBeInTheDocument();
  });
});
