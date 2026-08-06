import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { InstructorDashboardOverview } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardOverview";
import type { DashboardMetrics } from "@/types/dashboard";

const ubcDashboard = getInstitutionData("ubc")!.dashboard;

describe("InstructorDashboardOverview", () => {
  // Verifies: Renders dashboard metric cards.
  it("renders dashboard metric cards", () => {
    render(<InstructorDashboardOverview metrics={ubcDashboard.metrics} />);

    expect(screen.getByText("Active Courses")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
    expect(screen.getByText("Missing Submissions")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
