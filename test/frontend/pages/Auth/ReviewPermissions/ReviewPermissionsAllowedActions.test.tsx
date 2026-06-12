import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewPermissionsAllowedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsAllowedActions";

describe("ReviewPermissionsAllowedActions", () => {
  it("renders the section heading", () => {
    render(<ReviewPermissionsAllowedActions />);

    expect(
      screen.getByRole("heading", { name: "Allowed Actions" }),
    ).toBeInTheDocument();
  });

  it("renders all allowed action items", () => {
    render(<ReviewPermissionsAllowedActions />);

    expect(screen.getByText("View courses")).toBeInTheDocument();
    expect(
      screen.getByText("Access course list and basic course information"),
    ).toBeInTheDocument();
    expect(screen.getByText("View assignments")).toBeInTheDocument();
    expect(
      screen.getByText("Read assignment details and requirements"),
    ).toBeInTheDocument();
    expect(screen.getByText("View submissions")).toBeInTheDocument();
    expect(
      screen.getByText("Access student submissions and work"),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft messages")).toBeInTheDocument();
    expect(
      screen.getByText("Create message drafts for review before sending"),
    ).toBeInTheDocument();
  });
});
