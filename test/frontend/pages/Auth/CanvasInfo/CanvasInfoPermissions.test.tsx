import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasInfoPermissions } from "@/pages/Auth/CanvasInfo/CanvasInfoPermissions";

describe("CanvasInfoPermissions", () => {
  it("renders the section heading", () => {
    render(<CanvasInfoPermissions />);

    expect(
      screen.getByRole("heading", { name: "Requested Permissions" }),
    ).toBeInTheDocument();
  });

  it("renders all permission items with descriptions", () => {
    render(<CanvasInfoPermissions />);

    expect(screen.getByText("View Courses")).toBeInTheDocument();
    expect(
      screen.getByText("Access your course list and basic information."),
    ).toBeInTheDocument();
    expect(screen.getByText("Manage Assignments")).toBeInTheDocument();
    expect(
      screen.getByText("Create, edit, and organize assignments."),
    ).toBeInTheDocument();
    expect(screen.getByText("Access Grades")).toBeInTheDocument();
    expect(
      screen.getByText("View and manage student grades."),
    ).toBeInTheDocument();
    expect(screen.getByText("Read Announcements")).toBeInTheDocument();
    expect(
      screen.getByText("Access course announcements and updates."),
    ).toBeInTheDocument();
  });
});
