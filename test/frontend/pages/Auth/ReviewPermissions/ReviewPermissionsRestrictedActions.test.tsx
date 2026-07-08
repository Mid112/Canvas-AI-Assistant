import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewPermissionsRestrictedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsRestrictedActions";

describe("ReviewPermissionsRestrictedActions", () => {
  // Verifies: Renders the section heading.
  it("renders the section heading", () => {
    render(<ReviewPermissionsRestrictedActions />);

    expect(
      screen.getByRole("heading", { name: "Restricted Actions" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders all restricted action items.
  it("renders all restricted action items", () => {
    render(<ReviewPermissionsRestrictedActions />);

    expect(screen.getByText("Modify grades")).toBeInTheDocument();
    expect(
      screen.getByText("Direct grade changes require manual approval"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Publish assignments automatically"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Assignment publishing requires manual confirmation"),
    ).toBeInTheDocument();
  });
});
