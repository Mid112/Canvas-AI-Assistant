import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewPermissionsNote } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsNote";

describe("ReviewPermissionsNote", () => {
  // Verifies: Renders the permissions note.
  it("renders the permissions note", () => {
    render(<ReviewPermissionsNote />);

    expect(
      screen.getByText(/All AI-generated actions will be previewed before execution/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You maintain full control over what gets applied to your Canvas courses/),
    ).toBeInTheDocument();
  });
});
