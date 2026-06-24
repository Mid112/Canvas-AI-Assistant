import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getInstitutionData } from "@/data/institutionCourseData";
import { paths } from "@/routes/paths";
import { InstructorDashboardOverview } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardOverview";
import type { DashboardMetrics } from "@/types/dashboard";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const ubcDashboard = getInstitutionData("ubc")!.dashboard;

describe("InstructorDashboardOverview", () => {
  it("renders dashboard metric cards", () => {
    renderWithRouter(<InstructorDashboardOverview metrics={ubcDashboard.metrics} />);

    expect(screen.getByText("Active Courses")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
    expect(screen.getByText("Missing Submissions")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("links active courses to the courses page", () => {
    renderWithRouter(
      <InstructorDashboardOverview metrics={ubcDashboard.metrics} />,
    );

    expect(
      screen.getByRole("link", { name: /Active Courses/i }),
    ).toHaveAttribute("href", paths.instructor.courses);
  });

  it("links missing submissions to the analytics page", () => {
    renderWithRouter(
      <InstructorDashboardOverview metrics={ubcDashboard.metrics} />,
    );

    expect(
      screen.getByRole("link", { name: /Missing Submissions/i }),
    ).toHaveAttribute("href", `${paths.instructor.analytics}?status=missing`);
  });

  it("colors positive trends green and rising missing submissions red", () => {
    const metrics: DashboardMetrics = {
      activeCourses: 6,
      activeCoursesTrend: 8,
      totalStudents: 156,
      totalStudentsTrend: 12,
      missingSubmissions: 23,
      missingSubmissionsTrend: 5,
      pendingApprovals: 7,
    };

    renderWithRouter(<InstructorDashboardOverview metrics={metrics} />);

    expect(screen.getByText("+8%")).toHaveClass("text-emerald-600");
    expect(screen.getByText("+12%")).toHaveClass("text-emerald-600");
    expect(screen.getByText("5%")).toHaveClass("text-red-500");
  });

  it("shows green when missing submissions trend improves", () => {
    const metrics: DashboardMetrics = {
      ...ubcDashboard.metrics,
      missingSubmissionsTrend: -5,
    };

    renderWithRouter(<InstructorDashboardOverview metrics={metrics} />);

    expect(screen.getByText("5%")).toHaveClass("text-emerald-600");
  });
});
