import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorCoursesOverview } from "@/pages/Instructor/InstructorCourses/InstructorCoursesOverview";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const courses: InstructorCourse[] = [
  {
    id: 1,
    code: "CS 101",
    name: "Introduction to Programming",
    progress: 0,
    studentCount: 45,
    assignmentCount: 3,
    lastActivity: "Synced from Canvas",
  },
  {
    id: 2,
    code: "CS 201",
    name: "Data Structures",
    progress: 0,
    studentCount: 38,
    assignmentCount: 2,
    lastActivity: "Synced from Canvas",
  },
];

describe("InstructorCoursesOverview", () => {
  it("renders Canvas-derived overview cards", () => {
    renderWithRouter(<InstructorCoursesOverview courses={courses} />);

    expect(
      screen.getByRole("heading", { name: "Course Analytics Overview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Courses")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.getByText("Total Assignments")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Avg. Students / Course")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
