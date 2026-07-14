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

  // Verifies: Colors positive trends green and rising missing submissions red.
  it("colors positive trends green and rising missing submissions red", () => {
    const metrics: DashboardMetrics = {
      activeCourses: 4,
      activeCoursesTrend: 8,
      totalStudents: 156,
      totalStudentsTrend: 12,
      missingSubmissions: 23,
      missingSubmissionsTrend: 5,
      pendingApprovals: 7,
    };

    render(<InstructorDashboardOverview metrics={metrics} />);

    expect(screen.getByText("+8%")).toHaveClass("text-emerald-700");
    expect(screen.getByText("+12%")).toHaveClass("text-emerald-700");
    expect(screen.getByText("5%")).toHaveClass("text-destructive");
  });

  // Verifies: Shows green when missing submissions trend improves.
  it("shows green when missing submissions trend improves", () => {
    const metrics: DashboardMetrics = {
      ...ubcDashboard.metrics,
      missingSubmissionsTrend: -5,
    };

    render(<InstructorDashboardOverview metrics={metrics} />);

    expect(screen.getByText("5%")).toHaveClass("text-emerald-700");
  });
});
