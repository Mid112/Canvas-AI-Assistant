import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorDashboardHeader } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardHeader";

describe("InstructorDashboardHeader", () => {
  // Verifies: Renders the dashboard title and welcome message.
  it("renders the dashboard title and welcome message", () => {
    render(
      <InstructorDashboardHeader
        userName="Dr. Jane Doe"
        institutionShortName="UBC"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Welcome back, Dr. Jane Doe. Overview for UBC."),
    ).toBeInTheDocument();
  });
});
