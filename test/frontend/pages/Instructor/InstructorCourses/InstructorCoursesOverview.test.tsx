import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/pages/Instructor/InstructorCourses/institutionCourseData";
import { InstructorCoursesOverview } from "@/pages/Instructor/InstructorCourses/InstructorCoursesOverview";

describe("InstructorCoursesOverview", () => {
  it("renders analytics overview cards", () => {
    render(
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
    expect(screen.getByText("View Full Report")).toBeInTheDocument();
  });
});
