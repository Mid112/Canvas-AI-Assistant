import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import { InstructorCoursesOverview } from "@/pages/Instructor/InstructorCourses/InstructorCoursesOverview";
import type { CourseAnalyticsOverview } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("InstructorCoursesOverview", () => {
  it("renders analytics overview cards", () => {
    renderWithRouter(
      <InstructorCoursesOverview
        analytics={institutionCourseData[0]!.analytics}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Course Analytics Overview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Average Performance")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("Active Students")).toBeInTheDocument();
    expect(screen.getByText("142/156")).toBeInTheDocument();
    expect(screen.getByText("Completed Assignments")).toBeInTheDocument();
    expect(screen.getByText("At-Risk Students")).toBeInTheDocument();
    expect(screen.queryByText("View Full Report")).not.toBeInTheDocument();
  });

  it("colors trend details based on metric direction", () => {
    const analytics: CourseAnalyticsOverview = {
      averagePerformance: 70,
      averagePerformanceTrend: -4,
      activeStudents: 50,
      totalStudents: 100,
      completedAssignments: 80,
      completedAssignmentsTrend: 2,
      atRiskStudents: 12,
      atRiskStudentsTrend: 3,
    };

    renderWithRouter(<InstructorCoursesOverview analytics={analytics} />);

    expect(screen.getByText("-4%")).toHaveClass("text-destructive");
    expect(screen.getByText("+2%")).toHaveClass("text-emerald-600");
    expect(screen.getByText("+3%")).toHaveClass("text-destructive");
    expect(screen.getByText("50%")).toHaveClass("text-muted-foreground");
  });

  it("shows green for a decreasing at-risk trend", () => {
    renderWithRouter(
      <InstructorCoursesOverview
        analytics={institutionCourseData[0]!.analytics}
      />,
    );

    expect(screen.getByText("-2%")).toHaveClass("text-emerald-600");
  });
});
